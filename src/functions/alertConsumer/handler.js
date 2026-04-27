import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo } from "../../lib/dynamodb.js";

/**
 * alertConsumer: consume mensajes de AlertQueue cuando el stock está bajo threshold.
 * 
 * Recibe eventos de tipo "stock.low" y los guarda en la tabla de alertas.
 * Este es el último paso del flujo event-driven:
 * 
 * POST /orders → createOrder → EventBridge (order.created)
 *                                              ↓
 *                    KitchenQueue → kitchenConsumer (preparar)
 *                    BillingQueue → billingConsumer (facturar)
 *                    StockQueue → stockConsumer (descontar stock)
 *                                              ↓
 *                                    EventBridge (stock.low)
 *                                              ↓
 *                                    AlertQueue → alertConsumer (alertar)
 */

export const handler = async (event) => {
  for (const record of event.Records) {
    // El body viene como string (JSON stringify desde SQS), hay que parsearlo
    const body = JSON.parse(record.body);
    
    // Del evento stock.low vienen estos campos
    const { itemId, name, currentQuantity, threshold } = body.detail;

    console.log(`🚨 [ALERTA] Stock bajo para: ${name}`);
    console.log(`   Cantidad actual: ${currentQuantity} | Threshold: ${threshold}`);

    // Guardamos la alerta en DynamoDB para tener historial
    await dynamo.send(
      new PutCommand({
        TableName: process.env.ALERTS_TABLE,
        Item: {
          alertId: `${itemId}-${Date.now()}`,
          itemId,
          itemName: name,
          currentQuantity,
          threshold,
          createdAt: new Date().toISOString(),
        },
      }),
    );

    console.log(`[Alerta] Guardada en tabla de alertas`);
  }
};