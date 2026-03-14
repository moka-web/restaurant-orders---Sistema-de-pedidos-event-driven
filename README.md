#  restaurant-orders — Sistema de pedidos event-driven

Backend orientado a eventos para la gestión de pedidos de un restaurante.
Construido con Node.js, AWS Lambda, EventBridge, SQS y DynamoDB.

---

## El problema

Un restaurante sin sistema digital depende de comandas en papel, comunicación verbal
entre mozos y cocina, y registros manuales de caja. Esto genera pedidos perdidos,
errores en la cuenta y sin visibilidad del stock en tiempo real.

Este sistema resuelve ese flujo: desde que el cliente hace un pedido hasta que
cocina lo recibe, caja lo registra y el stock se actualiza — todo en paralelo,
de forma automática y con trazabilidad completa.

---

## Flujo principal

Un mozo (o en el futuro, el cliente vía QR) crea un pedido a través de la API.
Ese pedido dispara un evento central que se distribuye simultáneamente a tres
sistemas independientes:
```
POST /orders
     │
     ▼
API Gateway
     │
     ▼
Lambda — crear pedido → DynamoDB (persiste el pedido)
     │
     ▼
EventBridge (publica evento: order.created)
     │
     ├──→ SQS FIFO → Lambda Cocina      (recibe ítems en orden)
     ├──→ SQS Standard → Lambda Caja    (genera cuenta del cliente)
     └──→ SQS Standard → Lambda Stock   (descuenta ingredientes)
                              │
                              └──→ Si stock crítico → EventBridge (stock.low)
                                        │
                                        └──→ SQS → Lambda Alerta (notifica)
```

---

## Qué problema resuelve

| Problema real                          | Cómo lo resuelve este sistema             |
|----------------------------------------|-------------------------------------------|
| Pedidos que no llegan a cocina         | SQS FIFO garantiza entrega y orden        |
| Caja sin información en tiempo real    | Evento paralelo actualiza cuenta al instante |
| Stock que se agota sin aviso           | Lambda detecta stock crítico y alerta     |
| Falla en un área afecta a todas        | Consumidores desacoplados e independientes |
| Sin registro de qué pasó y cuándo      | Todos los eventos quedan en DynamoDB      |

---

## Arquitectura

### Servicios AWS utilizados

**API Gateway**
Expone los endpoints REST. Recibe los pedidos del exterior y los pasa a Lambda.

**AWS Lambda (Node.js 20.x)**
Toda la lógica de negocio vive en funciones Lambda independientes. Sin servidor
que mantener, escala automáticamente.

**Amazon EventBridge**
Bus de eventos central. Recibe el evento `order.created` y lo enruta a los
consumidores según reglas declarativas. Desacopla al emisor de los receptores.

**Amazon SQS**
- Cola FIFO para cocina: garantiza que los pedidos se procesen en el orden exacto
  en que fueron creados. Crítico para no confundir mesas.
- Colas Standard para caja y stock: mayor throughput, el orden no es determinante.

**Amazon DynamoDB**
Base de datos NoSQL para persistir pedidos, estado de mesas e historial de stock.
Sin esquema rígido, latencia baja, escala con la carga.

**Dead Letter Queues (DLQ)**
Cada cola SQS tiene una DLQ asociada. Si un Lambda falla 3 veces procesando un
mensaje, el mensaje va a la DLQ para revisión manual. Nada se pierde silenciosamente.

---

## Estructura del proyecto
```
restaurant-orders/
├── src/
│   ├── functions/
│   │   ├── createOrder/
│   │   │   ├── handler.js       # Recibe el pedido, persiste y publica evento
│   │   │   └── schema.js        # Validación con Zod
│   │   ├── kitchenConsumer/
│   │   │   └── handler.js       # Procesa ítems para cocina
│   │   ├── billingConsumer/
│   │   │   └── handler.js       # Genera cuenta del cliente
│   │   ├── stockConsumer/
│   │   │   └── handler.js       # Descuenta stock, detecta nivel crítico
│   │   └── alertConsumer/
│   │       └── handler.js       # Maneja alertas de stock bajo
│   ├── lib/
│   │   ├── dynamodb.js          # Cliente DynamoDB compartido
│   │   ├── eventbridge.js       # Publicación de eventos
│   │   └── errors.js            # Errores tipados
│   └── events/
│       └── schemas/
│           ├── order.created.json   # Schema del evento principal
│           └── stock.low.json       # Schema del evento de alerta
├── infra/
│   └── template.yaml            # AWS SAM — define toda la infraestructura
├── scripts/
│   └── seed-stock.js            # Carga stock inicial en DynamoDB
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── samconfig.toml
└── README.md
```

---

## Eventos del sistema

### `order.created`
Se publica cuando un pedido es creado y persistido correctamente.
```json
{
  "source": "restaurant.orders",
  "detail-type": "order.created",
  "detail": {
    "orderId": "uuid",
    "tableId": "string",
    "items": [
      {
        "id": "string",
        "name": "string",
        "quantity": "number"
      }
    ],
    "createdAt": "ISO8601"
  }
}
```

### `stock.low`
Se publica cuando un ingrediente cae por debajo del umbral mínimo.
```json
{
  "source": "restaurant.stock",
  "detail-type": "stock.low",
  "detail": {
    "ingredientId": "string",
    "ingredientName": "string",
    "currentQuantity": "number",
    "threshold": "number"
  }
}
```

---

## Stack tecnológico

| Tecnología     | Versión  | Uso                                 |
|----------------|----------|-------------------------------------|
| Node.js        | 20.x     | Runtime de todas las funciones      |
| AWS SAM        | latest   | Infraestructura como código (IaC)   |
| Middy          | 5.x      | Middleware para Lambda              |
| Zod            | 3.x      | Validación de schemas de entrada    |
| AWS SDK v3     | 3.x      | Cliente para todos los servicios    |
| Vitest         | latest   | Testing unitario e integración      |

---

## Cómo correrlo localmente

### Requisitos previos

- Node.js 20+
- AWS CLI configurado (`aws configure`)
- AWS SAM CLI instalado
- Docker (para SAM local)

### Instalación
```bash
git clone https://github.com/tu-usuario/restaurant-orders
cd restaurant-orders
npm install
```

### Variables de entorno
```bash
cp .env.example .env
# Completar con tus valores de AWS
```

### Levantar localmente con SAM
```bash
sam build
sam local start-api
```

### Seed de stock inicial
```bash
node scripts/seed-stock.js
```

### Simular un pedido
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "tableId": "mesa-5",
    "items": [
      { "id": "burger-01", "name": "Hamburguesa clásica", "quantity": 2 },
      { "id": "fries-01", "name": "Papas fritas", "quantity": 2 }
    ]
  }'
```

---

## Deploy en AWS
```bash
sam build
sam deploy --guided
```

SAM te va a pedir el nombre del stack, la región y confirmación de los recursos
a crear. En el primer deploy, usar `--guided`. Los siguientes: `sam deploy`.

---

## Plan de desarrollo — fin de semana

### Sábado — infraestructura y flujo principal

- [ ] Configurar proyecto: SAM, estructura de carpetas, dependencias
- [ ] Definir tabla DynamoDB y schemas de eventos
- [ ] Implementar `createOrder`: validación, persistencia, publicación a EventBridge
- [ ] Configurar EventBridge: event bus, reglas de enrutamiento, colas SQS
- [ ] Implementar `kitchenConsumer` y `billingConsumer`
- [ ] Probar el flujo completo end-to-end localmente

### Domingo — stock, alertas, errores y cierre

- [ ] Implementar `stockConsumer` con lógica de stock crítico
- [ ] Configurar DLQs en todas las colas
- [ ] Implementar `alertConsumer`
- [ ] Tests unitarios de los handlers principales
- [ ] Deploy en AWS y prueba real
- [ ] Documentar decisiones tomadas en el README

---

## Decisiones de diseño

**¿Por qué EventBridge y no SNS directo?**
EventBridge permite filtrar eventos por contenido (content-based routing) y
conectar fuentes externas de AWS sin código adicional. SNS es más simple pero
menos flexible para evolucionar el sistema.

**¿Por qué FIFO solo para cocina?**
El orden importa en cocina: si la mesa 5 pidió dos platos y luego modificó uno,
cocina tiene que ver eso en secuencia. Caja y stock no tienen esa restricción
y se benefician del mayor throughput de las colas Standard.

**¿Por qué SAM y no Serverless Framework o CDK?**
SAM es el tooling oficial de AWS para Lambda, tiene soporte nativo para testing
local con `sam local`, y su template.yaml es YAML legible. Para un proyecto de
aprendizaje, reduce la cantidad de abstracciones a entender.

---

## Lo que este proyecto no incluye (a propósito)

- Autenticación / autorización
- Frontend o app móvil
- Pagos reales
- Multi-restaurante / multi-tenant
- CI/CD pipeline

Estas exclusiones son intencionales para mantener el foco en la arquitectura
orientada a eventos. Cada una puede agregarse como extensión.

---

## Licencia

MIT