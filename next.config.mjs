/** @type {import('next').NextConfig} */
const config = {
  // Docker rehearsal is bound to loopback. Both local hostnames must be able
  // to load development scripts and endpoints, including HMR.
  allowedDevOrigins: ["127.0.0.1"],
};
export default config;
