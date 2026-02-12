import { Webhook } from "svix";
import { config } from "../config";
import {
  createUser,
  updateUser,
  deleteUser,
  findUserByClerkId,
} from "../db/queries/users";
import { success, error, serverError } from "../utils/response";
import type { ClerkWebhookEvent, ClerkUserData } from "../types";

export async function handleClerkWebhook(req: Request): Promise<Response> {
  const body = await req.text();
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return error("Missing svix headers", 400);
  }

  const wh = new Webhook(config.clerkWebhookSecret);
  let event: ClerkWebhookEvent;

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return error("Invalid webhook signature", 401);
  }

  try {
    switch (event.type) {
      case "user.created":
        await handleUserCreated(event.data);
        break;
      case "user.updated":
        await handleUserUpdated(event.data);
        break;
      case "user.deleted":
        await handleUserDeleted(event.data);
        break;
      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return success({ received: true });
  } catch (err) {
    console.error("Error processing webhook:", err);
    return serverError("Failed to process webhook");
  }
}

async function handleUserCreated(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.created for Clerk user: ${data.id}`);

  // Idempotency check
  const existingUser = await findUserByClerkId(data.id);
  if (existingUser) {
    console.log(`User already exists: ${data.id}`);
    return;
  }

  const primaryEmail = data.email_addresses?.[0]?.email_address || null;
  const displayName =
    [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  const user = await createUser({
    clerkUserId: data.id,
    email: primaryEmail,
    displayName,
  });

  console.log(`Created user: ${user.id} (Clerk: ${data.id})`);
}

async function handleUserUpdated(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.updated for Clerk user: ${data.id}`);

  const primaryEmail = data.email_addresses?.[0]?.email_address || null;
  const displayName =
    [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

  const user = await updateUser(data.id, {
    email: primaryEmail,
    displayName,
  });

  if (user) {
    console.log(`Updated user: ${user.id} (Clerk: ${data.id})`);
  } else {
    // User doesn't exist yet — create them
    console.log(`User not found, creating: ${data.id}`);
    await handleUserCreated(data);
  }
}

async function handleUserDeleted(data: ClerkUserData): Promise<void> {
  console.log(`Processing user.deleted for Clerk user: ${data.id}`);

  const deleted = await deleteUser(data.id);

  if (deleted) {
    console.log(`Deleted user (Clerk: ${data.id})`);
  } else {
    console.log(`User not found for deletion: ${data.id}`);
  }
}
