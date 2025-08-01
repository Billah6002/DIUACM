"use server";

import { db } from "@/db/drizzle";
import { blogPosts, type BlogPost, type NewBlogPost } from "@/db/schema";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, or, ilike, count, desc, and, sql } from "drizzle-orm";
import { blogFormSchema, type BlogFormValues } from "./schemas/blog";
import { hasPermission } from "@/lib/authorization";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "@/lib/s3";
import { v4 as uuid } from "uuid";

// Constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB in bytes

// Enhanced error handling type
type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// Type for blog data
type BlogData = BlogPost;
type BlogInsertData = NewBlogPost;

// Utility function to handle database errors
function handleDbError<T = unknown>(error: unknown): ActionResult<T> {
  console.error("Database error:", error);

  if (error instanceof Error) {
    // Handle specific database constraint errors
    if (error.message.includes("Duplicate entry")) {
      return {
        success: false,
        error: "A blog with this title or slug already exists",
      };
    }
  }

  return { success: false, error: "Something went wrong. Please try again." };
}

// Utility function to validate permissions
async function validatePermission<
  T = unknown
>(): Promise<ActionResult<T> | null> {
  if (!(await hasPermission("manage_blog_posts"))) {
    return {
      success: false,
      error: "You don't have permission to manage blog posts",
    };
  }
  return null;
}

export async function createBlog(
  values: BlogFormValues
): Promise<ActionResult> {
  try {
    const permissionError = await validatePermission();
    if (permissionError) return permissionError;

    const validatedFields = blogFormSchema.parse(values);

    // Check if blog title or slug already exists
    const existingBlog = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(
        or(
          eq(blogPosts.title, validatedFields.title),
          eq(blogPosts.slug, validatedFields.slug)
        )
      )
      .limit(1);

    if (existingBlog.length > 0) {
      return {
        success: false,
        error: "A blog with this title or slug already exists",
      };
    }

    // Convert form types to database types
    const dbValues: BlogInsertData = {
      title: validatedFields.title,
      slug: validatedFields.slug,
      author: validatedFields.author,
      content: validatedFields.content,
      status: validatedFields.status,
      featuredImage: validatedFields.featuredImage || null,
      publishedAt:
        validatedFields.publishedAt && validatedFields.publishedAt !== ""
          ? new Date(validatedFields.publishedAt)
          : null,
      isFeatured: validatedFields.isFeatured || false,
    };

    const result = await db
      .insert(blogPosts)
      .values(dbValues)
      .returning({ id: blogPosts.id });

    revalidatePath("/admin/blogs");
    revalidatePath("/blogs");

    return {
      success: true,
      data: { ...dbValues, id: result[0].id },
      message: "Blog post created successfully",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return {
        success: false,
        error: firstError?.message || "Please check the form for errors.",
      };
    }

    return handleDbError(error);
  }
}

export async function updateBlog(
  id: number,
  values: BlogFormValues
): Promise<ActionResult> {
  try {
    const permissionError = await validatePermission();
    if (permissionError) return permissionError;

    const validatedFields = blogFormSchema.parse(values);

    // Check if blog exists
    const existingBlog = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (existingBlog.length === 0) {
      return { success: false, error: "Blog post not found" };
    }

    // Check if another blog with same title or slug exists (excluding current blog)
    const duplicateBlog = await db
      .select({ id: blogPosts.id })
      .from(blogPosts)
      .where(
        and(
          or(
            eq(blogPosts.title, validatedFields.title),
            eq(blogPosts.slug, validatedFields.slug)
          ),
          sql`${blogPosts.id} != ${id}`
        )
      )
      .limit(1);

    if (duplicateBlog.length > 0) {
      return {
        success: false,
        error: "A blog with this title or slug already exists",
      };
    }

    // Convert form types to database types
    const dbValues: Partial<BlogInsertData> = {
      title: validatedFields.title,
      slug: validatedFields.slug,
      author: validatedFields.author,
      content: validatedFields.content,
      status: validatedFields.status,
      featuredImage: validatedFields.featuredImage || null,
      publishedAt:
        validatedFields.publishedAt && validatedFields.publishedAt !== ""
          ? new Date(validatedFields.publishedAt)
          : null,
      isFeatured: validatedFields.isFeatured || false,
    };

    await db.update(blogPosts).set(dbValues).where(eq(blogPosts.id, id));

    revalidatePath("/admin/blogs");
    revalidatePath(`/admin/blogs/${id}/edit`);
    revalidatePath("/blogs");

    return {
      success: true,
      data: { ...dbValues, id },
      message: "Blog post updated successfully",
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return {
        success: false,
        error: firstError?.message || "Please check the form for errors.",
      };
    }

    return handleDbError(error);
  }
}

export async function deleteBlog(id: number): Promise<ActionResult> {
  try {
    const permissionError = await validatePermission();
    if (permissionError) return permissionError;

    // Check if blog exists
    const blogData = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
      })
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (blogData.length === 0) {
      return { success: false, error: "Blog post not found" };
    }

    const blog = blogData[0];

    await db.delete(blogPosts).where(eq(blogPosts.id, id));

    revalidatePath("/admin/blogs");
    revalidatePath("/blogs");

    return {
      success: true,
      message: `Blog post "${blog.title}" deleted successfully`,
    };
  } catch (error) {
    return handleDbError(error);
  }
}

export async function getBlog(id: number): Promise<ActionResult<BlogData>> {
  try {
    const permissionError = await validatePermission<BlogData>();
    if (permissionError) return permissionError;

    const blog = await db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        author: blogPosts.author,
        content: blogPosts.content,
        status: blogPosts.status,
        featuredImage: blogPosts.featuredImage,
        publishedAt: blogPosts.publishedAt,
        isFeatured: blogPosts.isFeatured,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
      })
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);

    if (!blog || blog.length === 0) {
      return { success: false, error: "Blog post not found" };
    }

    return { success: true, data: blog[0] };
  } catch (error) {
    return handleDbError<BlogData>(error);
  }
}

type PaginatedBlogsData = {
  blogs: BlogData[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    pageSize: number;
  };
};

export async function getPaginatedBlogs(
  page: number = 1,
  pageSize: number = 10,
  search?: string
): Promise<ActionResult<PaginatedBlogsData>> {
  try {
    const permissionError = await validatePermission<PaginatedBlogsData>();
    if (permissionError) return permissionError;

    const skip = (page - 1) * pageSize;

    const searchCondition = search
      ? or(
          ilike(blogPosts.title, `%${search}%`),
          ilike(blogPosts.author, `%${search}%`),
          ilike(blogPosts.content, `%${search}%`)
        )
      : undefined;

    const [blogsData, totalCountResult] = await Promise.all([
      db
        .select({
          id: blogPosts.id,
          title: blogPosts.title,
          slug: blogPosts.slug,
          author: blogPosts.author,
          content: blogPosts.content,
          status: blogPosts.status,
          featuredImage: blogPosts.featuredImage,
          publishedAt: blogPosts.publishedAt,
          isFeatured: blogPosts.isFeatured,
          createdAt: blogPosts.createdAt,
          updatedAt: blogPosts.updatedAt,
        })
        .from(blogPosts)
        .where(searchCondition)
        .orderBy(desc(blogPosts.createdAt))
        .limit(pageSize)
        .offset(skip),
      db
        .select({ count: count() })
        .from(blogPosts)
        .where(searchCondition)
        .then((result) => result[0].count),
    ]);

    const totalPages = Math.ceil(totalCountResult / pageSize);

    return {
      success: true,
      data: {
        blogs: blogsData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount: totalCountResult,
          pageSize,
        },
      },
    };
  } catch (error) {
    return handleDbError<PaginatedBlogsData>(error);
  }
}

// Generate pre-signed URL for featured image upload
export async function generatePresignedUrl(
  fileType: string,
  fileSize: number
): Promise<ActionResult<{ presignedUrl: string; fileUrl: string }>> {
  try {
    // Check if the user has permission to manage blog posts
    if (!(await hasPermission("manage_blog_posts"))) {
      return { success: false, error: "Unauthorized" };
    }

    // Validate mime type
    if (!fileType.startsWith("image/")) {
      return { success: false, error: "Only image files are allowed" };
    }

    // Validate file size on the server
    if (fileSize > MAX_FILE_SIZE) {
      return { success: false, error: "File size exceeds the 5MB limit" };
    }

    const fileExtension = fileType.split("/")[1];
    const uniqueId = uuid();
    const key = `blog-images/${uniqueId}.${fileExtension}`;

    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ContentLength: fileSize,
    });

    const presignedUrl = await getSignedUrl(s3, putObjectCommand, {
      expiresIn: 300, // 5 minutes
    });

    const fileUrl = `${process.env.NEXT_PUBLIC_S3_DOMAIN}/${key}`;

    return {
      success: true,
      data: { presignedUrl, fileUrl },
    };
  } catch (error) {
    return handleDbError(error) as ActionResult<{
      presignedUrl: string;
      fileUrl: string;
    }>;
  }
}
