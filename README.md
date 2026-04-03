# Sistema de Pedidos — Guía de Arquitectura Orientada a Eventos con AWS

> Proyecto educativo para aprender Event-Driven Architecture (EDA) usando AWS Lambda, EventBridge, SQS y DynamoDB.
> Este README se construye de forma incremental a medida que avanzamos — cada sección explica el concepto antes de mostrar el código.

---

## Índice

1. [El problema del restaurante](#1-el-problema-del-restaurante)
2. [Qué es la Arquitectura Orientada a Eventos (EDA)](#2-qué-es-la-arquitectura-orientada-a-eventos-eda)
3. [Los componentes de AWS que usamos](#3-los-componentes-de-aws-que-usamos)
4. [Arquitectura del sistema](#4-arquitectura-del-sistema)
5. [Flujo completo de un pedido](#5-flujo-completo-de-un-pedido)
6. [Eventos del sistema](#6-eventos-del-sistema)
7. [Estructura del proyecto](#7-estructura-del-proyecto)
8. [Infraestructura como Código con SAM](#8-infraestructura-como-código-con-sam)
9. [Cómo correr el proyecto localmente](#9-cómo-correr-el-proyecto-localmente)
10. [Deploy en AWS](#10-deploy-en-aws)
11. [Decisiones de diseño](#11-decisiones-de-diseño)

---

## 1. El problema del restaurante

Imaginá que tenés un restaurante. Llega un pedido. Tres cosas tienen que pasar de forma simultánea:

1. La **cocina** tiene que prepararlo
2. La **caja** tiene que registrar el cobro
3. El **depósito** tiene que descontar el stock

### El enfoque tradicional (arquitectura acoplada)

La primera reacción de la mayoría de los programadores es resolver esto de forma secuencial: el código que crea el pedido llama a cada servicio uno por uno.

```js
// ❌ Arquitectura acoplada — un problema enorme disfrazado de solución simple
async function createOrder(order) {
  await guardarEnDB(order)
  await notificarCocina(order)        // Si esto falla, todo se detiene
  await registrarEnFacturacion(order) // Espera a que cocina termine
  await actualizarStock(order)        // Espera a que facturación termine
}
```

Este enfoque tiene problemas fundamentales:

| Problema | Consecuencia real |
|---|---|
| **Acoplamiento fuerte** | Si el servicio de cocina está caído, no podés crear pedidos |
| **Lentitud en cascada** | Si facturación tarda 2 segundos, el cliente espera 2 segundos innecesariamente |
| **Difícil de extender** | Agregar notificación por SMS al mozo requiere modificar `createOrder` |
| **Falla total** | Un error en cualquier paso interrumpe el flujo completo |
| **Sin resiliencia** | Si un paso falla, no hay reintento automático — el mensaje se pierde |

### El enfoque orientado a eventos (arquitectura desacoplada)

En lugar de que `createOrder` llame a todos, **publica un evento** — un mensaje que dice *"ocurrió algo"* — y se desentiende. Cada servicio escucha ese evento de forma **independiente y en paralelo**.

```
createOrder → publica "order.created" → termina su responsabilidad

(en paralelo, de forma completamente independiente...)
kitchenConsumer  → escucha "order.created" → notifica a la cocina
billingConsumer  → escucha "order.created" → registra el cobro
stockConsumer    → escucha "order.created" → descuenta el stock
```

---

## 2. Qué es la Arquitectura Orientada a Eventos (EDA)

La **Event-Driven Architecture (EDA)** es un estilo arquitectónico donde los componentes del sistema se comunican a través de **eventos** en lugar de llamadas directas entre sí.

### Conceptos fundamentales

#### Evento
Un evento es un registro inmutable de algo que ocurrió en el sistema. Tiene dos características clave:
- Describe **algo que ya pasó** (pasado, no futuro): "order.created", "stock.low", "payment.processed"
- Es **inmutable**: una vez publicado, no se modifica

```json
{
  "source": "restaurant.orders",
  "detail-type": "order.created",
  "detail": {
    "orderId": "abc-123",
    "tableId": "mesa-5",
    "createdAt": "2024-01-15T14:30:00Z"
  }
}
```

#### Productor (Producer)
El componente que detecta que algo ocurrió y publica el evento. En nuestro caso: `createOrder`. Su responsabilidad termina cuando publica el evento — no sabe ni le importa quién lo escucha.

#### Consumidor (Consumer)
El componente que escucha eventos y reacciona a ellos. En nuestro caso: `kitchenConsumer`, `billingConsumer`, `stockConsumer`. Cada uno trabaja de forma independiente.

#### Bus de eventos (Event Bus)
El canal central por donde viajan los eventos. En nuestro caso: **Amazon EventBridge**. Recibe eventos de los productores y los distribuye a los consumidores según reglas configurables.

### Ventajas clave

| Principio | Qué significa en la práctica |
|---|---|
| **Desacoplamiento** | `createOrder` no sabe quién escucha. No le importa. Pueden agregar nuevos consumers sin tocar `createOrder`. |
| **Independencia** | Si billing falla, la cocina sigue funcionando sin ningún problema |
| **Extensibilidad** | ¿Querés agregar notificación por email? Nuevo consumer, sin modificar nada existente |
| **Escalabilidad** | Cada consumer escala por separado según su propia carga de trabajo |
| **Resiliencia** | Si un consumer falla, el mensaje queda en la cola y se reintenta automáticamente |

---

## 3. Los componentes de AWS que usamos

### API Gateway
La puerta de entrada al sistema. Expone los endpoints HTTP públicos y los conecta con las funciones Lambda. Maneja autenticación, throttling y enrutamiento de requests.

En este proyecto: recibe `POST /orders` y lo pasa a la Lambda `createOrder`.

---

### AWS Lambda — Funciones serverless

Lambda permite ejecutar código **sin gestionar servidores**. Cada función se ejecuta solo cuando la invocan y se apaga automáticamente cuando termina.

**¿Por qué Lambda para los consumers?**
- Pagás solo por el tiempo de ejecución real (en milisegundos)
- Escala automáticamente: si llegan 1000 mensajes a la cola, Lambda levanta 1000 instancias en paralelo
- Sin mantenimiento: AWS gestiona el hardware, el sistema operativo y el runtime

En este proyecto tenemos 5 funciones Lambda:
- `createOrder` — crea el pedido
- `kitchenConsumer` — procesa pedidos para cocina
- `billingConsumer` — registra cobros
- `stockConsumer` — gestiona stock
- `alertConsumer` — envía alertas de stock crítico

---

### Amazon EventBridge — El bus de eventos

EventBridge es el **sistema nervioso central** de la arquitectura. Funciona como un cartero inteligente: recibe eventos, los clasifica según reglas, y los distribuye a los destinos correctos.

**¿Por qué EventBridge y no llamar directamente a SQS?**

Sin EventBridge, `createOrder` tendría que conocer explícitamente todas las colas a las que enviar mensajes. Con EventBridge, solo publica el evento y las **reglas declarativas** se encargan del enrutamiento.

```
Sin EventBridge (acoplado a destinos):        Con EventBridge (desacoplado):
createOrder → SQS kitchen                     createOrder → EventBridge
createOrder → SQS billing          vs                          │
createOrder → SQS stock                                   (reglas)
                                                    ├── SQS kitchen
                                                    ├── SQS billing
                                                    └── SQS stock
```

**Componentes clave de EventBridge:**
- **Event Bus**: el canal por donde viajan los eventos (usamos el bus por defecto de AWS)
- **Rules**: reglas que filtran eventos por contenido y los dirigen a destinos específicos
- **Targets**: los destinos de los eventos (en nuestro caso, colas SQS)

---

### Amazon SQS — Las colas de mensajes

SQS (Simple Queue Service) es el **sistema de colas** de AWS. Cuando EventBridge envía un evento, no invoca al consumer directamente — coloca el mensaje en una cola. El consumer lee la cola a su propio ritmo.

**¿Por qué necesitamos una cola entre EventBridge y Lambda?**

Sin cola, si el consumer falla, el evento se pierde. Con cola, el mensaje persiste hasta que sea procesado exitosamente. Esto garantiza que **ningún pedido se pierde**, incluso si hay errores temporales.

#### Tipos de cola que usamos

**SQS FIFO (First In, First Out) — para la cocina**

Los mensajes se entregan **estrictamente en el orden en que llegaron**. Fundamental para la cocina: si la mesa 3 primero pidió una entrada y después la modificó, la cocina tiene que recibir los eventos en ese orden exacto.

- Throughput: hasta 300 msg/seg (suficiente para cualquier restaurante)
- Deduplicación automática de mensajes repetidos
- Orden estrictamente garantizado

**SQS Standard — para billing y stock**

Los mensajes se entregan **al menos una vez**, con máximo throughput. El orden no está garantizado, pero la velocidad es mucho mayor. Para billing y stock, lo que importa es que el mensaje llegue, no el orden exacto entre pedidos de distintas mesas.

- Throughput: prácticamente ilimitado
- Entrega at-least-once (puede llegar más de una vez — los consumers deben ser idempotentes)

#### Dead Letter Queue (DLQ) — el buzón de mensajes fallidos

Cada cola SQS tiene una DLQ (Dead Letter Queue) asociada. Si un mensaje falla **3 veces consecutivas** (el consumer lanza una excepción), en lugar de descartarse silenciosamente, el mensaje se mueve a la DLQ.

Esto permite:
- Revisar qué mensajes fallaron y por qué
- Reprocesarlos una vez corregido el error
- **No perder información crítica nunca**

---

### Amazon DynamoDB — Base de datos NoSQL

DynamoDB es la base de datos de AWS. Es NoSQL (no relacional), sin esquema rígido, con latencia baja y escala automática.

En este proyecto almacena:
- Los pedidos creados (tabla `orders`)
- El stock de ingredientes (tabla `stock`)

---

## 4. Arquitectura del sistema

```
POST /orders
     │
     ▼
API Gateway
     │
     ▼
Lambda: createOrder ──────────────────── DynamoDB (orders table)
     │
     │ publica evento "order.created"
     ▼
EventBridge Bus
     │
     ├─────────────────────────┬──────────────────────────┐
     ▼                         ▼                          ▼
SQS FIFO Queue          SQS Standard Queue        SQS Standard Queue
(kitchen-queue.fifo)    (billing-queue)           (stock-queue)
     │                         │                          │
     ▼                         ▼                          ▼
Lambda:                 Lambda:                   Lambda:
kitchenConsumer         billingConsumer            stockConsumer
(orden garantizado)     (registra cobro)           (descuenta stock)
                                                          │
                                               (si stock < umbral)
                                                          │ publica "stock.low"
                                                          ▼
                                                   EventBridge Bus
                                                          │
                                                          ▼
                                                  SQS Standard Queue
                                                  (alert-queue)
                                                          │
                                                          ▼
                                                  Lambda: alertConsumer
                                                  (notifica al encargado)
```

---

## 5. Flujo completo de un pedido

```
1. El mozo hace POST /orders con { tableId: "mesa-5", items: [...] }

2. API Gateway recibe el request y lo pasa a la Lambda createOrder

3. createOrder valida el body:
   - ¿Tiene tableId? ¿No está vacío?
   - ¿Tiene al menos un item? ¿Cada item tiene id, name, quantity y price?
   → Si no cumple: devuelve 400 Bad Request

4. createOrder guarda el pedido en DynamoDB:
   { orderId: uuid, tableId, items, status: "pending", createdAt }

5. createOrder publica el evento "order.created" en EventBridge

6. EventBridge aplica sus reglas y envía el evento a 3 colas SQS en paralelo:
   a. kitchen-queue.fifo  → kitchenConsumer procesa los items en orden
   b. billing-queue       → billingConsumer registra el monto a cobrar
   c. stock-queue         → stockConsumer descuenta ingredientes

7. Si stockConsumer detecta que un ingrediente cayó bajo el umbral mínimo:
   a. Publica evento "stock.low" en EventBridge
   b. EventBridge lo envía a alert-queue
   c. alertConsumer notifica al encargado (log, email, etc.)

8. createOrder devuelve 201 Created con el objeto del pedido
   → El cliente no espera nada de los consumers. Son 100% asíncronos.
```

---

## 6. Eventos del sistema

Los eventos son el contrato entre productores y consumidores. Una vez definido el schema, ambos lados son independientes.

### `order.created`
Publicado por `createOrder` después de persistir el pedido en DynamoDB.

```json
{
  "source": "restaurant.orders",
  "detail-type": "order.created",
  "detail": {
    "orderId": "550e8400-e29b-41d4-a716-446655440000",
    "tableId": "mesa-5",
    "items": [
      { "id": "burger-01", "name": "Hamburguesa clásica", "quantity": 2, "price": 1200 }
    ],
    "createdAt": "2024-01-15T14:30:00.000Z"
  }
}
```

### `stock.low`
Publicado por `stockConsumer` cuando un ingrediente cae por debajo del umbral mínimo.

```json
{
  "source": "restaurant.stock",
  "detail-type": "stock.low",
  "detail": {
    "ingredientId": "ing-pan-brioche",
    "ingredientName": "Pan brioche",
    "currentQuantity": 3,
    "threshold": 10
  }
}
```

---

## 7. Estructura del proyecto

```
Sistema_de_Pedidos/
├── infra/
│   └── template.yaml              # SAM template — define TODOS los recursos AWS
├── src/
│   ├── functions/
│   │   ├── createOrder/
│   │   │   ├── handler.js         # Lambda: crea el pedido, publica evento
│   │   │   └── schema.js          # Validación Zod del request
│   │   ├── kitchenConsumer/
│   │   │   └── handler.js         # Lambda: consumer de la cola FIFO de cocina
│   │   ├── billingConsumer/
│   │   │   └── handler.js         # Lambda: consumer de facturación
│   │   ├── stockConsumer/
│   │   │   └── handler.js         # Lambda: consumer de stock (publica stock.low)
│   │   └── alertConsumer/
│   │       └── handler.js         # Lambda: consumer de alertas de stock crítico
│   ├── lib/
│   │   ├── dynamodb.js            # Cliente DynamoDB compartido
│   │   └── eventbridge.js         # Cliente EventBridge compartido
│   └── events/
│       └── schemas/
│           ├── order.created.json  # JSON Schema del evento order.created
│           └── stock.low.json      # JSON Schema del evento stock.low
├── tests/
│   ├── unit/                      # Tests unitarios con Vitest
│   └── integration/               # Tests de integración
├── scripts/
│   └── seed-stock.js              # Carga stock inicial en DynamoDB
└── docker-compose.yml             # DynamoDB local para desarrollo
```

---

## 8. Infraestructura como Código con SAM

Todo el sistema de AWS se define en **`infra/template.yaml`** usando AWS SAM (Serverless Application Model). Esto significa que la infraestructura — las Lambdas, las colas SQS, el bus de EventBridge, las tablas de DynamoDB — se crea y modifica ejecutando un comando, no haciendo click en la consola de AWS.

**Ventajas de IaC (Infrastructure as Code):**
- El estado del sistema está versionado en git
- Reproducible: cualquiera puede crear el mismo entorno desde cero
- Documentado: el template describe exactamente qué existe y cómo está configurado

---

## 9. Cómo correr el proyecto localmente

### Requisitos previos

- Node.js 20+
- Docker (para DynamoDB local y SAM local)
- AWS SAM CLI
- AWS CLI configurado (`aws configure`)

### Instalación

```bash
npm install
```

### Levantar DynamoDB local

```bash
docker-compose up -d
```

### Cargar stock inicial

```bash
node scripts/seed-stock.js
```

### Correr el API localmente

```bash
sam build --template infra/template.yaml
sam local start-api --template infra/template.yaml
```

### Simular un pedido

```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "tableId": "mesa-5",
    "items": [
      { "id": "burger-01", "name": "Hamburguesa clásica", "quantity": 2, "price": 1200 },
      { "id": "fries-01", "name": "Papas fritas", "quantity": 2, "price": 400 }
    ]
  }'
```

### Correr tests

```bash
npx vitest run
```

---

## 10. Deploy en AWS

```bash
# Primera vez (interactivo — te pide nombre del stack, región, etc.)
sam build && sam deploy --guided

# Deploys posteriores
sam build && sam deploy
```

---

## 11. Decisiones de diseño

### ¿Por qué EventBridge y no SNS?

SNS (Simple Notification Service) es más simple pero menos flexible. EventBridge permite **filtrar eventos por contenido** (content-based routing): podés definir que una regla solo se active si `detail.items` contiene cierto tipo de producto, por ejemplo. SNS no puede hacer eso sin lógica adicional en los consumers.

### ¿Por qué FIFO solo para cocina?

El orden importa en cocina: si la mesa 5 creó un pedido y después lo modificó, cocina tiene que ver esos eventos en secuencia para no preparar la versión vieja. Billing y stock no tienen esa restricción y se benefician del mayor throughput de las colas Standard.

### ¿Por qué SAM y no CDK o Serverless Framework?

SAM es el tooling oficial de AWS para Lambda. Tiene soporte nativo para testing local con `sam local`, su template es YAML declarativo y fácil de leer, y minimiza las abstracciones a entender. Para aprender el modelo de AWS, SAM te expone directamente a los recursos reales — CDK los abstrae demasiado.

### ¿Por qué DLQ en todas las colas?

Porque los mensajes fallidos son datos valiosos. Sin DLQ, si un consumer falla 3 veces, el mensaje desaparece silenciosamente. Con DLQ, ese mensaje queda guardado para inspección y reprocesamiento. En producción, nunca se pierden pedidos.

---

## Lo que este proyecto no incluye (intencional)

- Autenticación / autorización
- Frontend o app móvil
- Pagos reales
- Multi-restaurante / multi-tenant
- CI/CD pipeline

Estas exclusiones son intencionales para mantener el foco en la arquitectura orientada a eventos. Cada una puede agregarse como extensión una vez que el core está sólido.
