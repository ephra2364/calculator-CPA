/** @type {import('next').NextConfig} */
const basePath = process.env.BASE_PATH ?? '/calculator-CPA';
export default { output: 'export', basePath, assetPrefix: basePath + '/', images: { unoptimized: true }, trailingSlash: true, env: { NEXT_PUBLIC_BASE_PATH: basePath } };
