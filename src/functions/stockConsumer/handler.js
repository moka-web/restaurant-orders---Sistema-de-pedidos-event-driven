import { UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { dynamo } from "../../lib/dynamodb.js";
import { eventbridge } from "../../lib/eventbridge.js";

//en este caso el handler lo que hacer es , por cada orden

export const handler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);

    const { orderId, items } = body.detail;

    console.log("[Stock] procesando orden ");

    for (const item of items) {
      const currentItem = await dynamo.send(
        new GetCommand({
          TableName: process.env.STOCK_TABLE,
          Key: { itemId: item.id },
        }),
      );
      //no entiendo por que va con mayuscula
      if (!currentItem.Item) {
        console.log("item does not exists ");
        continue;
        //esto no se si esta bien
      }

      const newQuantity = currentItem.Item.quantity - item.quantity;

      //actualiza el stock 
      await dynamo.send(
        new UpdateCommand({
          TableName: process.env.STOCK_TABLE,
          Key: { itemId: item.id },
          UpdateExpression: "SET quantity = :qty",
          ExpressionAttributeValues: { ":qty": newQuantity },
        }),
      );


      console.log(`[Stock] ${item.name}: ${currentItem.Item.quantity} → ${newQuantity}`,);


      
      //si el stock es menor al minimo se dispara un nuevo evento con la alerta 
      if (newQuantity < currentItem.Item.threshold) {
        
        await eventbridge.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: "restaurant.stock",
                DetailType: "stock.low",
                Detail: JSON.stringify({
                  itemId: item.id,
                  name: item.name,
                  currentQuantity: newQuantity,
                  threshold: currentItem.Item.threshold,
                }),
                EventBusName: process.env.EVENT_BUS_NAME,
              },
            ],
          }),
        );

        console.log(
          `[Stock] ⚠️ ALERTA: ${item.name} bajo threshold (${newQuantity} < ${currentItem.Item.threshold})`,
        );
      }
    }
  }
};
