import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PushSubscription, PushSubscriptionDocument } from './schemas/push-subscription.schema';

// Lazy-init firebase-admin so the server starts without a service account
let firebaseApp: any = null;
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      firebaseApp = admin.apps[0];
      return firebaseApp;
    }
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      Logger.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled', 'PushService');
      return null;
    }
    const serviceAccount = JSON.parse(serviceAccountJson);
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    Logger.log('[FCM] Firebase Admin initialized', 'PushService');
    return firebaseApp;
  } catch (err: any) {
    Logger.error(`[FCM] Firebase Admin init failed: ${err?.message}`, 'PushService');
    return null;
  }
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectModel(PushSubscription.name) private subscriptionModel: Model<PushSubscriptionDocument>,
  ) {}

  // ── Register / refresh a push subscription ──────────────────────────────────

  async subscribe(
    userId: string,
    data: {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      fcmToken?: string;
      platform?: string;
    },
  ) {
    if (data.endpoint) {
      await this.subscriptionModel.findOneAndUpdate(
        { endpoint: data.endpoint },
        {
          userId: new Types.ObjectId(userId),
          endpoint: data.endpoint,
          keys: data.keys,
          platform: data.platform || 'web',
        },
        { upsert: true, new: true },
      );
    }
    if (data.fcmToken) {
      // Upsert by (userId, fcmToken) so re-registering the same token is idempotent
      await this.subscriptionModel.findOneAndUpdate(
        { userId: new Types.ObjectId(userId), fcmToken: data.fcmToken },
        {
          userId: new Types.ObjectId(userId),
          fcmToken: data.fcmToken,
          platform: data.platform || 'android',
        },
        { upsert: true, new: true },
      );
    }
    return { success: true };
  }

  // ── Refresh FCM token on login (removes old tokens, registers new one) ──────

  async refreshFcmToken(userId: string, newToken: string, platform = 'android') {
    // Remove any old stale FCM entries for this user that are different from the new token
    await this.subscriptionModel.deleteMany({
      userId: new Types.ObjectId(userId),
      fcmToken: { $exists: true, $ne: newToken },
    });
    // Upsert the fresh token
    await this.subscriptionModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), fcmToken: newToken },
      { userId: new Types.ObjectId(userId), fcmToken: newToken, platform },
      { upsert: true, new: true },
    );
    this.logger.log(`[FCM] Refreshed token for user ${userId}`);
  }

  // ── Send a push notification to a user ──────────────────────────────────────

  async sendToUser(
    userId: string,
    notification: { title: string; body: string },
    data?: Record<string, string>,
  ) {
    const app = getFirebaseApp();
    if (!app) return; // FCM not configured — silently skip

    const subscriptions = await this.subscriptionModel
      .find({ userId: new Types.ObjectId(userId), fcmToken: { $exists: true, $ne: null } })
      .lean();

    if (!subscriptions.length) return;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const admin = require('firebase-admin');
    const staleTokens: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        const token = (sub as any).fcmToken as string;
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: notification.title,
              body: notification.body,
            },
            data: data || {},
            android: {
              priority: 'high',
              notification: {
                channelId: 'messages',
                priority: 'high',
                defaultSound: true,
                defaultVibrateTimings: true,
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  badge: 1,
                },
              },
            },
          });
          this.logger.log(`[FCM] Notification sent to user ${userId} via token ...${token.slice(-8)}`);
        } catch (err: any) {
          const errCode = err?.errorInfo?.code || err?.code || '';
          // Token is invalid/expired — queue for removal
          if (
            errCode.includes('registration-token-not-registered') ||
            errCode.includes('invalid-registration-token') ||
            errCode.includes('invalid-argument')
          ) {
            staleTokens.push(token);
          } else {
            this.logger.warn(`[FCM] Send failed for user ${userId}: ${err?.message}`);
          }
        }
      }),
    );

    // Clean up stale tokens
    if (staleTokens.length) {
      await this.subscriptionModel.deleteMany({ fcmToken: { $in: staleTokens } });
      this.logger.log(`[FCM] Removed ${staleTokens.length} stale token(s) for user ${userId}`);
    }
  }
}
