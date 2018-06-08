'use strict';

import { Handler, Context, Callback } from 'aws-lambda';
import * as AWS from 'aws-sdk';

const handler: Handler = (event: any, context: Context, callback: Callback) => {
    AWS.config.update({ region: process.env.SLS_AWS_REGION });

    // If you don't use that flag, your lambda function will not 'complete' and you will receive timeout error from your lambda function
    context.callbackWaitsForEmptyEventLoop = false;

    const responses = {
        success: (data = {}, code = 200) => {
            return {
                statusCode: code,
                headers: responseHeaders,
                body: JSON.stringify(data)
            };
        },
        error: (error: any) => {
            return {
                statusCode: error.code || 500,
                headers: responseHeaders,
                body: error.msg
            };
        }
    };

    const responseHeaders = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Credentials": true
    };

    const customerId = event.pathParameters.customerId;
    const ACCOUNTS_TABLE = process.env.TABLE_NAME;
    const GSI_NAME = process.env.GSI_NAME;
    const dynamoDb = new AWS.DynamoDB.DocumentClient();

    if (ACCOUNTS_TABLE && GSI_NAME) {
        const params = {
            TableName: ACCOUNTS_TABLE,
            IndexName: GSI_NAME,
            KeyConditionExpression: "customerId = :customerId",
            ExpressionAttributeValues: {
                ":customerId": +customerId
            }
        };

        console.log("Get account activities, query params: " + JSON.stringify(params));

        dynamoDb
            .query(params)
            .promise()
            .then(data => {
                if (data.Items && data.Items.length > 0) {
                    callback(null, responses.success(data.Items));
                } else {
                    callback(
                        null,
                        responses.error({ code: "404", msg: "Accounts not found" })
                    );
                }
            })
            .catch(error => {
                console.error("Could not get account list: " + error);
                callback(
                    null,
                    responses.error({ code: "400", msg: "Could not get account list" })
                );
            });
    } else {
        console.error("Some environment variables are missing!");
    }
};

export { handler };
