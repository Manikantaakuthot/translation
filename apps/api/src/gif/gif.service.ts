import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GifService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://tenor.googleapis.com/v2';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('TENOR_API_KEY') || '';
  }

  async search(query: string, limit = 20) {
    if (!this.apiKey) {
      return { results: [], message: 'Tenor API key not configured' };
    }
    try {
      const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&key=${this.apiKey}&limit=${limit}&media_filter=gif,tinygif`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        results: (data.results || []).map((r: any) => ({
          id: r.id,
          title: r.title || '',
          url: r.media_formats?.gif?.url || r.url,
          previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || '',
          width: r.media_formats?.gif?.dims?.[0] || 0,
          height: r.media_formats?.gif?.dims?.[1] || 0,
        })),
      };
    } catch (err) {
      console.error('[GIF] Search error:', err);
      return { results: [] };
    }
  }

  async trending(limit = 20) {
    if (!this.apiKey) {
      return { results: [], message: 'Tenor API key not configured' };
    }
    try {
      const url = `${this.baseUrl}/featured?key=${this.apiKey}&limit=${limit}&media_filter=gif,tinygif`;
      const res = await fetch(url);
      const data = await res.json();
      return {
        results: (data.results || []).map((r: any) => ({
          id: r.id,
          title: r.title || '',
          url: r.media_formats?.gif?.url || r.url,
          previewUrl: r.media_formats?.tinygif?.url || r.media_formats?.gif?.url || '',
          width: r.media_formats?.gif?.dims?.[0] || 0,
          height: r.media_formats?.gif?.dims?.[1] || 0,
        })),
      };
    } catch (err) {
      console.error('[GIF] Trending error:', err);
      return { results: [] };
    }
  }
}
