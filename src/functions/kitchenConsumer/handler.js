import { UpdateCommand } from "@aws-sdk/lib-dynamodb"; // esto es para actualizar un item, en este caso para modificar el status de  la orden 

import { dynamo } from "../../lib/dynamodb.js";


export const handler = async (event) => {

    //even.records es un array , es el batch de sqs , porque puede agrupar varios mensajes y mandarlos todos juntos en una sola invocacion de lambda  

    // para cada record
    for (const record of event.Records) {

        //revisar en create order como se publica el evento en eventbridge ,
        //  porque el payload de ese evento es lo que vamos a recibir en este handler ,
        //  entonces tenemos que parsear el body del record para obtener los datos de la orden que se publicó en eventbridge

        const body = JSON.parse(record.body)

        //en el detalle de cada record se encuentra la orden 
        const {orderId , tableId} = body.detail

        console.log(`[kitchen] Orden recibida — orderId: ${orderId}, mesa: ${tableId}`)

      
        //manejo de palabras reservadas de aws , en este caso status
        await dynamo.send(new UpdateCommand({
            TableName: process.env.ORDERS_TABLE,
            Key: { orderId },
            UpdateExpression: 'SET #s = :s',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':s': 'preparing' },
        }))


         console.log(`[kitchen] Orden ${orderId} actualizada a "preparing"`)


    }

}