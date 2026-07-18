import { healthResponseSchema } from '@arad-crm/api-contracts';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';

const route = createRoute({
  method: 'get',
  path: '/',
  responses: {
    200: {
      description: 'Service health',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
});

export const healthRoutes = new OpenAPIHono().openapi(route, (c) =>
  c.json(
    { status: 'ok' as const, service: 'arad-crm-api' as const, time: new Date().toISOString() },
    200,
  ),
);
