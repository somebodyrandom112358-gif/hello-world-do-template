import { DurableObject } from "cloudflare:workers";

export class MyDurableObject extends DurableObject<Env> {
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async receiveLocation(
		clientId: string,
		latitude: number,
		longitude: number,
	): Promise<{ success: boolean; clientId: string; latitude: number; longitude: number }> {
		console.log("Received location:", {
			clientId,
			latitude,
			longitude,
		});

		return {
			success: true,
			clientId,
			latitude,
			longitude,
		};
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/location" && request.method === "POST") {
			const body = await request.json();

			const clientId = body.clientId;
			const latitude = body.latitude;
			const longitude = body.longitude;

			if (
				typeof clientId !== "string" ||
				typeof latitude !== "number" ||
				typeof longitude !== "number"
			) {
				return new Response(
					JSON.stringify({ error: "Invalid location data" }),
					{
						status: 400,
						headers: {
							"Content-Type": "application/json",
						},
					},
				);
			}

			const id = env.MY_DURABLE_OBJECT.idFromName("communal-map");
			const stub = env.MY_DURABLE_OBJECT.get(id);

			const result = await stub.receiveLocation(
				clientId,
				latitude,
				longitude,
			);

			return new Response(JSON.stringify(result), {
				headers: {
					"Content-Type": "application/json",
				},
			});
		}

		return new Response("Communal Map Worker is running.");
	},
} satisfies ExportedHandler<Env>;
