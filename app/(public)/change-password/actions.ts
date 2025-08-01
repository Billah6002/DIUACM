"use server";

import { db } from "@/db/drizzle";
import { users } from "@/db/schema";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { changePasswordSchema, ChangePasswordValues } from "./schemas/change-password";
import z from "zod";

// Enhanced error handling type
type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};


export async function changePassword(
  values: ChangePasswordValues
): Promise<ActionResult> {
  try {
    // Validate the session
    const session = await auth();
    if (!session?.user?.email) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    // Validate the input
    const validatedData = changePasswordSchema.parse(values);

    // Hash the new password
    const hashedPassword = await bcrypt.hash(validatedData.newPassword, 12);

    // Update the password in the database
    await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.email, session.user.email));

    return {
      success: true,
      message: "Password changed successfully",
    };
  } catch (error) {
    console.error("Change password error:", error);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues[0]?.message || "Invalid input",
      };
    }

    return {
      success: false,
      error: "Failed to change password. Please try again.",
    };
  }
}
