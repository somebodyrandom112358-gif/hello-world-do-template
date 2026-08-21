import { DurableObject } from "cloudflare:workers";

function findSquare(latitude: number, longitude: number): string | null {
    const row = Math.floor((latitude - 29.7604) / 0.0145);
    const col = Math.floor((longitude + 97.7431) / 0.0177);

    if (row < 0 || row >= 209 || col < 0 || col >= 135) {
        return null;
    }

    return `square-${row}-${col}`;
}


// This describes the information we want to remember
// about the communal map.
type MapState = {
    users: Record<string, string>;
    territory: Record<string, string>;
	colors: Record<string, string>;
};


export class MyDurableObject extends DurableObject<Env> {

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
    }


    async receiveLocation(
        clientId: string,
        latitude: number,
        longitude: number,
    ) {

        const squareId = findSquare(latitude, longitude);

        console.log("Received location:", {
            clientId,
            latitude,
            longitude,
            squareId,
        });

		if (!squareId) {
            return {
                success: false,
                clientId,
                squareId: null,
            };
        }
		
		let state = await this.ctx.storage.get<MapState>("mapState");

		if (!state) {
		    state = {
		        users: {},
		        territory: {},
				colors: {},
		    };
		}

		if (squareId) {
			const oldClientId = state.territory[squareId];
		    if (oldClientId && oldClientId !== clientId) {
		        delete state.users[oldClientId];
		    }
			state.users[clientId] = squareId;
    		state.territory[squareId] = clientId;
		}

		await this.ctx.storage.put("mapState", state);

        console.log("Current map state:", state);


        return {
            success: true,
            clientId,
            squareId,
        };
    }

	async setColor(
	    clientId: string,
	    color: string
	): Promise<void> {
	    const state = await this.getState();
	
	    state.colors[clientId] = color;
	
	    await this.ctx.storage.put("mapState", state);
	}

	async getState(): Promise<MapState> {
	    const state = await this.ctx.storage.get<MapState>("mapState");
	
	    return state ?? {
	        users: {},
	        territory: {},
			colors: {},
	    };
	}

	async resetState(): Promise<void> {
	    await this.ctx.storage.delete("mapState");
	}
}


export default {

    async fetch(request, env, ctx): Promise<Response> {

        const url = new URL(request.url);

		if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

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
                    JSON.stringify({
                        success: false,
                        error: "Invalid request",
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
							"Access-Control-Allow-Origin": "*",
                        },
                    }
                );
            }


            const id = env.MY_DURABLE_OBJECT.idFromName("communal-map");

            const stub = env.MY_DURABLE_OBJECT.get(id);


            const result = await stub.receiveLocation(
                clientId,
                latitude,
                longitude
            );


            return new Response(
                JSON.stringify(result),
                {
                    headers: {
                        "Content-Type": "application/json",
    					"Access-Control-Allow-Origin": "*",
                    },
                }
            );
        }

		if (url.pathname === "/state" && request.method === "GET") {
		    const id = env.MY_DURABLE_OBJECT.idFromName("communal-map");
		    const stub = env.MY_DURABLE_OBJECT.get(id);
		
		    const state = await stub.getState();
		
		    return new Response(
		        JSON.stringify(state),
		        {
		            headers: {
		                "Content-Type": "application/json",
    					"Access-Control-Allow-Origin": "*",
		            },
		        }
		    );
		}

		if (url.pathname === "/color" && request.method === "POST") {
		    const body = await request.json();
		
		    const clientId = body.clientId;
		    const color = body.color;

			const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(color);
		
		    if (
		        typeof clientId !== "string" ||
			    typeof color !== "string" ||
			    !isValidHex
		    ) {
		        return new Response(
		            JSON.stringify({
		                success: false,
		                error: "Invalid clientId or color",
		            }),
		            {
		                status: 400,
		                headers: {
		                    "Content-Type": "application/json",
		                    "Access-Control-Allow-Origin": "*",
		                },
		            }
		        );
		    }
		
		    const id = env.MY_DURABLE_OBJECT.idFromName("communal-map");
		    const stub = env.MY_DURABLE_OBJECT.get(id);
		
		    await stub.setColor(clientId, color);
		
		    return new Response(
		        JSON.stringify({
		            success: true,
		            clientId,
		            color,
		        }),
		        {
		            headers: {
		                "Content-Type": "application/json",
		                "Access-Control-Allow-Origin": "*",
		            },
		        }
		    );
		}

		if (url.pathname === "/reset" && request.method === "POST") {
		    const id = env.MY_DURABLE_OBJECT.idFromName("communal-map");
		    const stub = env.MY_DURABLE_OBJECT.get(id);
		
		    await stub.resetState();
		
		    return new Response(
		        JSON.stringify({
		            success: true,
		            message: "Map state reset",
		        }),
		        {
		            headers: {
		                "Content-Type": "application/json",
		                "Access-Control-Allow-Origin": "*",
		            },
		        }
		    );
		}
		
        return new Response("Not found", { status: 404 });
    },
};
