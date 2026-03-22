import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StickerPack, StickerPackDocument } from './schemas/sticker-pack.schema';

@Injectable()
export class StickersService {
  constructor(
    @InjectModel(StickerPack.name) private stickerPackModel: Model<StickerPackDocument>,
  ) {}

  async getAllPacks(search?: string) {
    const query: any = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const packs = await this.stickerPackModel.find(query).sort({ isDefault: -1, downloadCount: -1 }).lean();
    return packs.map((p: any) => this.formatPack(p));
  }

  async getDefaultPacks() {
    const packs = await this.stickerPackModel.find({ isDefault: true }).lean();
    return packs.map((p: any) => this.formatPack(p));
  }

  async getPack(id: string) {
    const pack = await this.stickerPackModel.findById(id).lean();
    if (!pack) throw new NotFoundException('Sticker pack not found');
    return this.formatPack(pack);
  }

  async createPack(data: { name: string; publisher?: string; iconUrl?: string; stickers: { name: string; imageUrl: string; emoji?: string }[] }) {
    const pack = await this.stickerPackModel.create({
      name: data.name,
      publisher: data.publisher,
      iconUrl: data.iconUrl || data.stickers?.[0]?.imageUrl,
      stickers: data.stickers || [],
    });
    return this.formatPack(pack);
  }

  async deletePack(id: string) {
    const pack = await this.stickerPackModel.findById(id);
    if (!pack) throw new NotFoundException('Sticker pack not found');
    await this.stickerPackModel.deleteOne({ _id: pack._id });
    return { success: true };
  }

  private formatPack(p: any) {
    return {
      id: p._id.toString(),
      name: p.name,
      publisher: p.publisher,
      iconUrl: p.iconUrl,
      stickers: p.stickers || [],
      isDefault: p.isDefault ?? false,
      downloadCount: p.downloadCount ?? 0,
    };
  }
}
