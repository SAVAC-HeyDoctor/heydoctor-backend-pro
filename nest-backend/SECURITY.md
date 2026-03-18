# Seguridad

## Vulnerabilidades

- **Producción**: Las dependencias de producción (runtime) están actualizadas. Se usan overrides para `multer` (^2.1.0) y `file-type` (^21.0.0).
- **Desarrollo**: Las 6 vulnerabilidades restantes están en devDependencies (@nestjs/cli, @angular-devkit). No se incluyen en el build de producción (`npm ci --only=production`).

## Actualizar dependencias

```bash
npm audit
npm audit fix --legacy-peer-deps
npm run build
```
