import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

export const signIn = async () => {
    await authClient.signIn.social({
        provider: "github"
    });
};

export const { 
    signOut, 
    signUp, 
    useSession 
} = authClient;
