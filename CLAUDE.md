# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Event-driven backend for restaurant order management. Built with Node.js 20, AWS Lambda, EventBridge, SQS, and DynamoDB. Infrastructure is defined as code using AWS SAM.

## Commands

```bash
# Install dependencies
npm install

# Build and run locally (requires Docker)
sam build
sam local start-api

# Seed initial stock data
node scripts/seed-stock.js

# Run tests (Vitest)
npx vitest
npx vitest run tests/unit/createOrder.test.js   # single test file

# Deploy to AWS
sam build && sam deploy --guided   # first time
sam build && sam deploy            # subsequent deploys
```

## Architecture

An order creation triggers a central `order.created` event on EventBridge, which fans out simultaneously to three independent consumers via SQS:

```
POST /orders → API Gateway → Lambda createOrder → DynamoDB
                                     ↓
                              EventBridge (order.created)
                                     ↓
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                       ▼
         SQS FIFO              SQS Standard           SQS Standard
         kitchenConsumer        billingConsumer         stockConsumer
                                                             ↓ (if stock critical)
                                                      EventBridge (stock.low)
                                                             ↓
                                                       SQS → alertConsumer
```

**Key design decisions:**
- Kitchen uses FIFO queue to guarantee order sequence (mesa modifications must arrive in order); billing and stock use Standard queues for higher throughput
- EventBridge over SNS for content-based routing flexibility
- Every SQS queue has a DLQ — failed messages after 3 retries go there, never silently dropped
- SAM over CDK/Serverless for native local testing with `sam local`

## Source structure

- `src/functions/<name>/handler.js` — Lambda handlers (createOrder, kitchenConsumer, billingConsumer, stockConsumer, alertConsumer)
- `src/functions/createOrder/schema.js` — Zod input validation schema
- `src/lib/` — Shared clients: `dynamodb.js`, `eventbridge.js`, `errors.js`
- `src/events/schemas/` — JSON schemas for `order.created` and `stock.low` events
- `infra/template.yaml` — SAM template defining all AWS resources
- `scripts/seed-stock.js` — Loads initial stock into DynamoDB
- `tests/unit/` and `tests/integration/` — Vitest test suites

## Event schemas

`order.created` — published by `createOrder` after persisting to DynamoDB:
```json
{ "source": "restaurant.orders", "detail-type": "order.created",
  "detail": { "orderId": "uuid", "tableId": "string", "items": [...], "createdAt": "ISO8601" } }
```

`stock.low` — published by `stockConsumer` when an ingredient drops below threshold:
```json
{ "source": "restaurant.stock", "detail-type": "stock.low",
  "detail": { "ingredientId": "string", "ingredientName": "string", "currentQuantity": 0, "threshold": 0 } }
```

## Out of scope (intentional)

Authentication, frontend, real payments, multi-tenant, and CI/CD are excluded to keep focus on event-driven patterns.
