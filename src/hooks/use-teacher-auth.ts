"use client"

import { useUser, useClerk } from "@clerk/nextjs"

export function useTeacherAuth() {
  const { isSignedIn } = useUser()
  const { signOut } = useClerk()

  // If signed in via Clerk, you're a "teacher" (full edit access)
  const isTeacher = !!isSignedIn

  const endTeacherSession = async () => {
    await signOut()
  }

  return { isTeacher, endTeacherSession }
}
