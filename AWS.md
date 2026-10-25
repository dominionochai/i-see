# AWS deployment (optional)

`aws/lambda/handler.mjs` is a standalone, dependency-free Node.js 18 function (arm64) that runs the same vision-identify logic as `src/app/api/vision/identify/route.ts`. It can be deployed as an AWS Lambda Function URL when you want the vision backend to run serverless instead of inside the Next.js app: set `NEXT_PUBLIC_VISION_ENDPOINT` to the Function URL and identify calls are routed there.

- Function: `aws/lambda/handler.mjs` (whole app in one file)
- Runtime metadata: `aws/lambda/package.json` (zero dependencies, Node >= 18)
- Step-by-step deploy, packaging and curl tests: `aws/README.md`

Why serverless: the core gaze pipeline stays entirely client-side (MediaPipe + OpenCV.js in the browser, no data leaves the device), while the optional identify step can run on AWS Graviton (arm64) with no server to maintain and nothing to pay on the free tier.
