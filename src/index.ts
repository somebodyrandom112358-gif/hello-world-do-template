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
    squares: Record<string, string>;
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
		        squares: {},
		    };
		}

		if (squareId) {
			const oldClientId = state.squares[squareId];
		    if (oldClientId && oldClientId !== clientId) {
		        delete state.users[oldClientId];
		    }
			state.users[clientId] = squareId;
    		state.squares[squareId] = clientId;
		}

		await this.ctx.storage.put("mapState", state);

        console.log("Current map state:", state);


        return {
            success: true,
            clientId,
            squareId,
        };
    }

	async getState(): Promise<MapState> {
	    const state = await this.ctx.storage.get<MapState>("mapState");
	
	    return state ?? {
	        users: {},
	        squares: {},
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
                    JSON.stringify({
                        success: false,
                        error: "Invalid request",
                    }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
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
		            },
		        }
		    );
		}
		
        return new Response("Not found", { status: 404 });
    },
};
