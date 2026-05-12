import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['bufferutil', 'utf-8-validate'],
}

export default nextConfig
