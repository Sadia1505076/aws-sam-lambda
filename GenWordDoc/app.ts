import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import fs from 'fs-extra';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
// import { PDFDocument } from 'pdf-lib';
import AWS from 'aws-sdk';
import { GetObjectRequest } from 'aws-sdk/clients/s3';
import { exec } from 'child_process';
import { promisify } from 'util';

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

interface TemplateData {
    name: string;
    date: string;
}

const s3 = new AWS.S3();
const execPromise = promisify(exec);

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // ----- reading the docx file from s3, converting it to pdf and again saving the file to another s3-------
        const readBucketName = process.env.READ_BUCKET_NAME;
        const key = 'template.docx';

        const params: GetObjectRequest = {
            Bucket: readBucketName || "read_bucket_name",
            Key: key
        };
        //--- if we need to save the template.docx--------
        let retrievedFile = fs.createWriteStream("/tmp/template.docx");
        await new Promise((resolve, reject) => {
            s3.getObject(params).createReadStream()
                .pipe(retrievedFile)
                .on("finish", resolve)
                .on("error", reject);
        });
        const libreOfficePath = '/opt/libreoffice/program/soffice'; // sam extracts the lambda layer at runtime and put it inside the opt/ folder of the container
        const inputFilePath = '/tmp/template.docx';
    
        await execPromise(`${libreOfficePath} --headless --convert-to pdf --outdir /tmp ${inputFilePath}`);
        console.log('Conversion done');

        // s3 write
        const writeBucketName = process.env.WRITE_BUCKET_NAME;
        const pdfData = await fs.readFile('/tmp/template.pdf');
        const writeParams = {
            Bucket: writeBucketName || '',
            Key: 'template.pdf',
            Body: pdfData,
            ContentType: 'application/pdf'
        };
        await s3.putObject(writeParams).promise();
        console.log('pdf written');
        
        //----- if we want to just work on the file from memory--------------
        // -------- the code below inserts value to placeholders of a docx file-----------

        // const data: TemplateData = {
        //     name: 'John Doe',
        //     date: new Date().toISOString().split('T')[0],
        // };
        // const content = await s3.getObject(params).promise();
        // const fileContent = content.Body;
        // if(fileContent) {
        //     let binaryContent = fileContent.toString("binary");
        //     // Step 1: Load the DOCX template
        //     // for more details: //https://docxtemplater.com/docs/get-started-node/
        //     const zip = new PizZip(binaryContent);
        //     const doc = new Docxtemplater(zip);

        //     // Step 2: Replace placeholders with actual values
        //     doc.setData(data);
        //     try {
        //         doc.render();
        //     } catch (error) {
        //         console.error('Error rendering document:', error);
        //         throw error;
        //     }

        //     const buffer = doc.getZip().generate({ type: 'nodebuffer' });
        //     await fs.writeFile('/tmp/output.docx', buffer);
        //     return {
        //         statusCode: 200,
        //         body: JSON.stringify({ message: 'Docx created successfully' }),
        //     };
        // }


        //------- the pdf-lib library is helpful if we want to modify a pdf------

        // Step 3: Convert the modified DOCX to PDF
        // const pdfDoc = await PDFDocument.create();
        // const page = pdfDoc.addPage();
        // const { width, height } = page.getSize();
        // const fontSize = 24;
        // page.drawText(data.name, {
        //     x: 50,
        //     y: height - 4 * fontSize,
        //     size: fontSize,
        // });
        // console.log("pdf writing prep is done");
        // const pdfBytes = await pdfDoc.save();
        // await fs.writeFile('/tmp/output.pdf', pdfBytes);
        // console.log("pdf writing is done");

        return {
            statusCode: 404,
            body: JSON.stringify({ message: 'File not found' }),
        };
    } catch (err) {
        console.log(err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened' + err,
            }),
        };
    }
};
