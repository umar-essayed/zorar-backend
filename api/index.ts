import * as dns from 'dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from '../src/app.module';
import { setupApp } from '../src/main';

let cachedServer: any = null;

export async function createServerlessServer(): Promise<any> {
  const expressApp = (express as any).default ? (express as any).default() : (express as any)();
  const adapter = new ExpressAdapter(expressApp);

  const app = await NestFactory.create(AppModule, adapter);
  setupApp(app);

  await app.init();
  return expressApp;
}

export default async function handler(req: any, res: any) {
  if (!cachedServer) {
    cachedServer = await createServerlessServer();
  }
  return cachedServer(req, res);
}
