# Sistema de Administración de Restaurante

Sistema POS completo para gestión de restaurantes construido con **TanStack Start + React 19 + TypeScript + Tailwind v4 + Lovable Cloud (Postgres + Auth + Realtime + Storage + RLS)**.

## Módulos

| Módulo | Ruta | Descripción |
| --- | --- | --- |
| Dashboard | `/dashboard` | KPIs en vivo, mesas, pedidos, alertas de stock |
| Mesas | `/mesas` | Plano editable con drag & drop, estados en tiempo real |
| Pedidos | `/pedidos/:tableId` | Toma de pedido, modificadores, dividir/transferir cuenta |
| Carta | `/carta` | CRUD de categorías y productos con imagen |
| Cocina (KDS) | `/cocina` | Display en tiempo real, avance de estados |
| Ingredientes | `/ingredientes` | Stock, recetas, costos |
| Compras | `/compras` | Órdenes a proveedores, actualización de stock/costo promedio |
| Caja | `/caja` | Apertura, movimientos, arqueo y cierre |
| Clientes | `/clientes` | CRUD + fidelización (puntos, gasto, visitas) |
| Inventario | `/inventario` | Stock valorizado + movimientos |
| Reportes | `/reportes` | Ventas por día/hora/mozo/mesa, top productos, rentabilidad |
| Configuración | `/configuracion` | Datos del restaurante, moneda, IVA, propina + auditoría |

## Roles

`admin`, `encargado`, `mozo`, `caja`, `cocina`. Se validan mediante la función `has_role()` con `SECURITY DEFINER` y tabla `user_roles` separada de `profiles` (evita escalación de privilegios).

## Flujo operativo

1. **Admin** carga carta, mesas, ingredientes y recetas.
2. **Caja** abre el turno con monto inicial.
3. **Mozo** toma pedidos por mesa → envía a cocina.
4. **Cocina** (KDS) marca ítems como preparando / listo / entregado. Al entregar, se descuenta stock por receta.
5. **Caja** cobra el pedido (pagos múltiples), suma puntos al cliente, libera la mesa.
6. **Encargado / Admin** revisa reportes, inventario valorizado, auditoría y cierra la caja con arqueo.

## Datos demo

La Fase 5 inserta:

- 4 proveedores, 12 ingredientes con stock y costo
- 4 clientes (incluye "Consumidor Final")
- Configuración inicial del restaurante (ARS, IVA 21%, propina 10%)

Los productos, categorías y mesas ya venían cargados desde fases anteriores.

## Seguridad

- RLS activo en todas las tablas de `public`
- `GRANT` explícito por tabla a `authenticated` / `service_role` (nunca a `anon` salvo rutas públicas)
- Funciones `SECURITY DEFINER` con `search_path=public` y sin acceso a `anon`
- Auditoría automática por trigger en tablas críticas

## Publicación

Al terminar la revisión, publicá desde el botón **Publish** arriba a la derecha.
