import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MediaService {
  private s3: S3Client | null = null;
  private bucket: string | null = null;
  private readonly uploadDir = './uploads';

  constructor(private config: ConfigService) {
    const accessKey = this.config.get('AWS_ACCESS_KEY_ID');
    const secretKey = this.config.get('AWS_SECRET_ACCESS_KEY');
    const region = this.config.get('AWS_REGION') || 'us-east-1';
    this.bucket = this.config.get('S3_BUCKET') || null;
    if (accessKey && secretKey && this.bucket) {
      this.s3 = new S3Client({
        region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
    }
  }

  async upload(file: Express.Multer.File): Promise<{ mediaUrl: string; filename: string }> {
    const ext = extname(file.originalname) || '.bin';
    const filename = `${randomUUID()}${ext}`;

    if (this.s3 && this.bucket) {
      const key = `uploads/${filename}`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const baseUrl = this.config.get('S3_PUBLIC_URL') || `https://${this.bucket}.s3.amazonaws.com`;
      const mediaUrl = `${baseUrl}/${key}`;
      return { mediaUrl, filename };
    }

    const destDir = path.resolve(this.uploadDir);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, filename);
    fs.writeFileSync(destPath, file.buffer);
    const baseUrl = this.config.get('API_URL') || `http://localhost:${this.config.get('PORT') || 3000}`;
    const mediaUrl = `${baseUrl}/uploads/${filename}`;
    return { mediaUrl, filename };
  }
}
