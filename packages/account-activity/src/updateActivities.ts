"use strict";

import { Handler, Context, Callback } from "aws-lambda";
import * as AWS from "aws-sdk";

interface UpdateActivitiesResponse {
    statusCode: number;
    body: string;
}

const handler: Handler = (event: any, context: Context, callback: Callback) => {
    AWS.config.update({ region: process.env.SLS_AWS_REGION });
    const s3 = new AWS.S3();
    // const dynamoDb = new AWS.DynamoDB();

    event.Records.forEach((record: any) => {
        const bucketName = record.s3.bucket.name;
        const filename = record.s3.object.key;
        console.log(
            `New feed ${filename} has been uploaded to ${bucketName}`
        );
        const params = {
            Bucket: bucketName,
            Key: filename
        };
        let chunk;
        const readable = s3.getObject(params).createReadStream();
        readable.setEncoding("utf-8");

        readable.on("readable", () => {
            chunk = readable.read();
            while (null !== chunk) {
                console.log(`Feed body: ${chunk}`);
                chunk = readable.read();
            }
        });
    });

    const response: UpdateActivitiesResponse = {
        statusCode: 200,
        body: JSON.stringify(event)
    };

    callback(undefined, response);
};

export { handler };
