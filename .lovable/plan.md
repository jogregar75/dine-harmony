
# Sistema de Administración de Restaurante — Plan por fases

Dado el enorme alcance del pedido, lo dividimos en **5 fases** entregables. Cada fase deja el sistema utilizable en producción, y las siguientes suman módulos sin romper lo anterior.

## Stack (decidido)

- **Frontend:** React 19 + TypeScript + TanStack Start + TailwindCSS v4
- **Backend/DB:** Lovable Cloud (PostgreSQL + Auth JWT + Storage + Server Functions + Realtime + RLS)
- **UI:** Shadcn customizado, tema **Dark POS** (fondo oscuro slate, acentos cian/ámbar), animaciones suaves, responsive
- **Arquitectura:** modular por dominios, tipado estricto, RLS por rol, auditoría automática

> Nota: se pidió MySQL/Prisma/Express. Lovable Cloud entrega lo mismo funcionalmente sobre Postgres; toda la lógica de negocio, auth JWT y API quedan cubiertas de forma nativa e integrada.

---

## Fase 1 — Núcleo Operativo (esta iteración)

Lo mínimo para que el restaurante ya pueda operar de punta a punta.

**Base de datos (Postgres, normalizada, con FKs y RLS):**
- `profiles` (1‑a‑1 con `auth.users`)
- `user_roles` + enum `app_role` (`admin`, `encargado`, `mozo`, `caja`, `cocina`) + función `has_role()`
- `categories`, `products` (nombre, código, descripción, imagen, precio, IVA, tiempo prep, disponible)
- `tables` (número, capacidad, forma cuadrada/redonda/rectangular, x, y, width, height, estado libre/ocupada/reservada/limpieza)
- `orders` (mesa, mozo, estado, total, tipo mesa/llevar/delivery), `order_items` (producto, cantidad, notas, estado cocina pendiente/preparando/listo/entregado)
- `audit_log` (usuario, acción, tabla, registro, ip, timestamp) alimentada por triggers

**Frontend:**
- Auth (login/registro email+password, protección de rutas por rol)
- **Dashboard** con KPIs en vivo: ventas del día, mesas ocupadas/libres, pedidos pendientes, pedidos en cocina
- **Plano de mesas** editable con drag & drop, resize, cambio de forma/número/capacidad; colores por estado; clic abre pedido
- **Carta** CRUD de categorías y productos con imagen (Storage), toggle disponible
- **Pedidos** por mesa: agregar productos, notas, enviar a cocina, cobrar, cerrar
- **Kitchen Display (KDS)** en tiempo real (Realtime): tarjetas de pedidos con avance de estados
- **Layout POS**: sidebar navegación, topbar con caja/usuario, tema dark

---

## Fase 2 — Inventario y Recetas

- `ingredients` (unidad, stock actual/mín/máx, costo, proveedor, vencimiento, lote)
- `recipes` (product ↔ ingredient con cantidad)
- `product_options` + `order_item_modifiers` (checks tipo "sin tomate", extras con precio)
- Trigger: al marcar `order_item` como entregado, descuenta ingredientes según receta
- CRUD compras y proveedores, actualización de stock y costo promedio
- Alertas de bajo stock en el dashboard

## Fase 3 — Caja, Pagos, Clientes

- Apertura/cierre de caja, arqueo, ingresos/egresos, movimientos
- Pagos múltiples y mixtos (efectivo, débito, crédito, transferencia, MP, QR)
- Clientes CRUD, historial de compras, puntos de fidelización
- Reservas, dividir cuenta, unir mesas, mover pedido entre mesas
- Estructura tablas `invoices` preparada para AFIP/ARCA (sin integrar aún)

## Fase 4 — Reportes y Configuración

- Reportes: ventas por día/mes/hora/mozo/mesa, top y bottom productos, rentabilidad, inventario valorizado, ganancias
- Gráficos con Recharts
- Configuración: datos del restaurante, impuestos, moneda, propinas, comisiones, impresoras (placeholder)
- Panel de auditoría filtrable

## Fase 5 — Producción

- Seed de datos demo (categorías, productos, mesas, ingredientes, usuarios de cada rol)
- Documentación técnica y de instalación
- Revisión de seguridad, RLS y performance
- Publicación

---

## Qué se entrega **hoy** (Fase 1)

1. Migración SQL completa del núcleo (tablas + FKs + RLS + roles + triggers de auditoría)
2. Auth con roles y ruta protegida `_authenticated`
3. Dashboard con KPIs conectados a datos reales
4. Editor de plano de mesas con drag&drop, resize, formas y estados
5. CRUD de carta con subida de imágenes
6. Flujo de pedido por mesa
7. Kitchen Display en tiempo real
8. Tema Dark POS aplicado en todo el sistema

Al terminar, te pregunto por cuál fase seguimos.
