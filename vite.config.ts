import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

function localServerlessPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'local-serverless-api',
    configureServer(server) {
      // Inject server-only env variables into process.env for local handlers
      Object.assign(process.env, env);

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;

        let handlerModule: any = null;
        if (pathname === '/api/upload-s3') {
          handlerModule = await import('./api/upload-s3.js');
        } else if (pathname === '/api/send-email') {
          handlerModule = await import('./api/send-email.js');
        } else if (pathname === '/api/s3-manage') {
          handlerModule = await import('./api/s3-manage.js');
        } else if (pathname === '/api/tts-polly') {
          handlerModule = await import('./api/tts-polly.js');
        } else if (pathname === '/api/jobs' || pathname.startsWith('/api/jobs/') || pathname === '/api/jobs/receive') {
          handlerModule = await import('./api/jobs.js');
        }

        if (!handlerModule || !handlerModule.default) {
          return next();
        }

        // Helper response methods for Express/Vercel compat
        (res as any).status = function (code: number) {
          this.statusCode = code;
          return this;
        };
        (res as any).json = function (data: any) {
          this.setHeader('Content-Type', 'application/json');
          this.end(JSON.stringify(data));
          return this;
        };
        (res as any).send = function (data: any) {
          if (Buffer.isBuffer(data)) {
            this.end(data);
          } else if (typeof data === 'object') {
            this.setHeader('Content-Type', 'application/json');
            this.end(JSON.stringify(data));
          } else {
            this.end(String(data));
          }
          return this;
        };

        // Parse JSON body for POST/PUT requests
        let body: any = {};
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
            }
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            if (rawBody) {
              body = JSON.parse(rawBody);
            }
          } catch (e) {
            body = {};
          }
        }

        const customReq = Object.assign(req, {
          body,
          query: Object.fromEntries(urlObj.searchParams.entries())
        });

        try {
          await handlerModule.default(customReq, res);
        } catch (handlerErr: any) {
          console.error('[Local Serverless Handler Error]:', handlerErr);
          if (!res.writableEnded) {
            (res as any).status(500).json({ error: handlerErr.message });
          }
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0'
      },
      plugins: [tailwindcss(), react(), localServerlessPlugin(env)],
      optimizeDeps: {
        esbuildOptions: {
          target: 'esnext',
        },
      },
      build: {
        target: 'esnext',
      },
      define: {
        'process.env.ANTHROPIC_BASE_URL': JSON.stringify(env.VITE_ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL || ''),
        'process.env.ANTHROPIC_WORKSPACE_ID': JSON.stringify(env.VITE_ANTHROPIC_WORKSPACE_ID || env.ANTHROPIC_WORKSPACE_ID || 'default'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
