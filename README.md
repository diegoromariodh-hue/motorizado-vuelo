# Vuelo Driver V2

Versión revisada del conductor.

Incluye:
- Login para conductores aprobados.
- Recuperar contraseña por correo.
- PWA instalable.
- Notificaciones obligatorias antes de conectarse.
- Estado disponible/desconectado.
- Ver solicitudes de viaje.
- Enviar oferta o contraoferta.
- Tiempo aproximado de llegada.
- Viaje activo.
- Estados: voy en camino, llegué, iniciar, finalizar.
- Compartir ubicación GPS.
- Finanzas estimadas: ingresos, comisión 0%, comisión teórica.
- Seguridad por rol, cuenta activa y RLS mejorado.

## Instalar
npm install
npm run dev

## Producción
Usa `.env.production.example` como referencia:

VITE_APP_URL=https://driver.vuelonicaragua.online

## SQL
Ejecuta `SUPABASE_DRIVER_V2_SQL.sql` en Supabase SQL Editor.

## Supabase Auth Redirect URL
Agrega:
https://driver.vuelonicaragua.online/reset-password

## Importante
Para que un conductor pueda usar esta app:
1. Debe existir en `profiles` con role = 'driver'.
2. Debe existir en `drivers` con `profile_id` igual al ID de su perfil.
3. `profiles.is_active` debe estar en true.
