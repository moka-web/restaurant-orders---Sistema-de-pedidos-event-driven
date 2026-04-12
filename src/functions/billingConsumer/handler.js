import { UpdateCommand } from "@aws-sdk/lib-dynamodb"; // esto es para actualizar un item, en este caso para modificar el status de  la orden 

import { dynamo } from "../../lib/dynamodb.js";


export const handler = async (event)=>{



    for (const record of event.Records) {
        
        const body = JSON.parse(record.body);   

        const {orderId,tableId} = body.detail; 

        console.log(`[Billing] Orden recibida — orderId: ${orderId}, mesa: ${tableId}`)


        await dynamo.send( new UpdateCommand(
            {
            TableName: process.env.ORDERS_TABLE,
            Key: {orderId},
            UpdateExpression:'SET billingStatus = :status',
            ExpressionAttributeValues:{':status' : 'billed'}
            }
        ))


        console.log(`[Billing] Orden ${orderId} actualizada a "Billed"`)
    }



}