import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Dev server for `npm run dev` only. An uncommon port avoids clashing with other local
  // servers (3000 is WXT's default); if it's taken, WXT picks the next free one.
  dev: { server: { port: 47613 } },
  manifest: {
    name: 'ArtiShare',
    description: 'Invite saved lists of email addresses to claude.ai artifacts in bulk.',
    // No `tabs` permission: the host permission below already exposes the URL of claude.ai tabs,
    // which is all the extension reads, without the "Read your browsing history" install warning.
    permissions: ['storage', 'sidePanel', 'scripting'],
    host_permissions: ['https://claude.ai/*'],
    action: { default_title: 'ArtiShare' },
    // Public key only. It pins the extension ID to eeihicglfclmofckclcpjleekpddjflg wherever the
    // unpacked folder lives, so saved lists survive updates and moving the folder.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqXRHCvMs3DIO2wNZLu1Pf9cDzmX7B9T+tz6nA7BF0aCGPqQ02qyUU8gqFPPq2C/8dcku3Vw1S1ZLdwYHJb2vkqiI0WJzkZvladAB/JB4+rDQ6qdGbtK4/1dpIzz/OA6jfUaT0K9mzufvrSvM9gc0W6ypD23bxP+QV7ARwuC66XEKlPtgdUf9CPB15pebWnhxD7Wvred9yBHGtlN2YdnLgoX0Sph34yQ4ZAmTHbpV2K7Da38eBMH9zpDsKavvWYOm0xo1FvN2YeyZcauksZs+Wxdrq6uvZj/SkZDDUXjqtkogLnUqY3388jBqicw5v1QQPeMkfJb4qxxyHIkS/s2sUQIDAQAB',
  },
});
