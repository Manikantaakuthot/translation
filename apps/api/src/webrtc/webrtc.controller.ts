import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('webrtc')
export class WebRtcController {
  constructor(private config: ConfigService) {}

  @Get('config')
  async getConfig() {
    const stunUrls = (this.config.get('STUN_SERVERS') || 'stun:stun.l.google.com:19302').split(',');

    const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
      ...stunUrls.map((u: string) => ({ urls: u.trim() })),
    ];

    // Fetch dynamic TURN credentials from Metered.ca API
    const apiKey = this.config.get('METERED_API_KEY');
    const apiUrl = this.config.get('METERED_API_URL');
    if (apiKey && apiUrl) {
      try {
        const res = await fetch(`${apiUrl}?apiKey=${apiKey}`);
        if (res.ok) {
          const turnServers = await res.json();
          iceServers.push(...turnServers);
        }
      } catch (err) {
        console.warn('Failed to fetch TURN credentials from Metered:', err);
      }
    }

    return { iceServers };
  }
}
