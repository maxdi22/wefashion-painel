import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export class StorageService {
  private static readonly UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

  constructor() {
    if (!fs.existsSync(StorageService.UPLOAD_DIR)) {
      fs.mkdirSync(StorageService.UPLOAD_DIR, { recursive: true });
    }
  }

  /**
   * Faz upload de um arquivo local para o Cloudinary e retorna a URL
   */
  public static async uploadToCloud(filePath: string): Promise<string> {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'vto_users'
    });
    return result.secure_url;
  }

  /**
   * Faz upload de um buffer diretamente para o Cloudinary e retorna a URL
   */
  public static async uploadBuffer(buffer: Buffer): Promise<string> {
    const isLocal = process.env.STORAGE_TYPE === 'local' || !process.env.CLOUDINARY_API_KEY;

    if (isLocal) {
      // Como a API da Fal muitas vezes recusa strings imensas em base64 (causando Erro 400), 
      // e como não temos Cloudinary no momento, o ideal é usar o próprio fal.storage.upload
      const { fal } = require('@fal-ai/client');
      const blob = new Blob([buffer], { type: 'image/jpeg' });
      const url = await fal.storage.upload(blob);
      return url;
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: 'vto_users' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result!.secure_url);
        }
      );
      uploadStream.end(buffer);
    });
  }

  /**
   * Baixa uma imagem de uma URL e salva localmente
   */
  public static async saveFromUrl(url: string, fileName: string): Promise<string> {
    // ... logic remains same ...
    const dir = this.UPLOAD_DIR;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);

    return new Promise((resolve, reject) => {
      (response.data as any).pipe(writer);
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  }

  /**
   * Converte uma URL local (ex: localhost, deployteste.local) para uma URL pública suportada pela Fal.ai.
   * Se já for pública, retorna a própria.
   */
  public static async transformToPublicUrl(url: string): Promise<string> {
    if (!url) return url;
    
    // Verifica se a URL é puramente local
    if (url.includes('localhost') || url.includes('.local') || url.includes('127.0.0.1')) {
      console.log(`[StorageService] URL local detectada (${url}). Transformando em URL pública via Fal Storage...`);
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'arraybuffer'
        });
        
        const buffer = Buffer.from(response.data as ArrayBuffer);
        const { fal } = require('@fal-ai/client');
        const blob = new Blob([buffer]); // arraybuffer to Blob
        const publicUrl = await fal.storage.upload(blob);
        console.log(`[StorageService] Conversão concluída: ${publicUrl}`);
        return publicUrl;
      } catch (error: any) {
        console.error(`[StorageService] Falha ao converter URL local para pública: ${error.message}`);
        throw error;
      }
    }
    
    return url;
  }
}
