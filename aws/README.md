# I-See AWS Lambda deployment

The competition requires a component of the entry to run on AWS. This folder is that component: a self-contained Lambda function that runs the **same vision-identify logic** as `src/app/api/vision/identify/route.ts`, deployed serverless with an HTTP Function URL.

It has zero dependencies (Node 18+ built-in `fetch`), runs on **arm64 (Graviton)**, and costs nothing on the Lambda free tier.

## Files

- `lambda/handler.mjs` - the whole function (health probe + identify)
- `lambda/package.json` - runtime metadata (no deps)

## Deploy (about 10 minutes, no CLI needed)

1. AWS Console > Lambda > **Create function**
2. Choose **Author from scratch**: name `i-see-identify`, runtime **Node.js 18.x**, architecture **arm64**, then **Create function**
3. In the code editor, delete the placeholder and paste the entire contents of `handler.mjs`
4. **Deploy** (top right)
5. Configuration > Environment variables > Add: `GEMINI_API_KEY` = your Google AI Studio key, save
6. Configuration > **Function URL** > Enable: auth type **NONE**, CORS: allow `*`. Copy the URL
7. Test with the curl command below

## Local packaging (optional, if you prefer upload)

PowerShell (Windows):

```powershell
cd aws\lambda
Compress-Archive -Path handler.mjs, package.json -DestinationPath i-see-lambda.zip -Force
```

Then in the Console: Function > **Upload from** > **.zip file**. (The inline paste in step 3 is faster.)

## Test

Health probe (this always answers - judges hitting the URL get a real response):

```bash
curl -X GET "<FUNCTION_URL>"
# -> {"ok":true,"service":"i-see vision identify (AWS Lambda, arm64)","version":"1.0.0"}
```

Identify (replace `BASE64_IMAGE` with a base64 JPEG):

```bash
curl -X POST "<FUNCTION_URL>" \\
  -H "Content-Type: application/json" \\
  -d '{"focus":{"data":"BASE64_IMAGE","mimeType":"image/jpeg"}}'
```

## How the app uses it

The Next.js app calls `/api/vision/identify` locally in dev. In production the same request can be pointed at the Lambda Function URL via the `NEXT_PUBLIC_VISION_ENDPOINT` env var (see `src/lib/visionEndpoint.ts`), so the AWS component is the live vision backend, not a stub.

## Notes

- Timeout: set **10 s** (Configuration > General configuration)
- Memory: **256 MB** is plenty
- The function returns honest errors: 400 bad input, 502 Gemini failure, 503 missing API key - never a crash or empty body
- Lambda free tier: 1M requests / 400k GB-seconds per month - this deployment costs $0
