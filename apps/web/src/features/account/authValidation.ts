import { sanitizePublicMessage } from "../../shared/helpers";

export interface AuthFieldErrors {
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  address?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface PasswordResetInput {
  email: string;
}

export interface SignupInput extends LoginInput {
  fullName: string;
  phone: string;
  address: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9\s().-]+$/;

export function validateLoginFields(input: LoginInput): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const email = input.email.trim();

  if (!email) {
    errors.email = "Email address is required.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  if (!input.password) {
    errors.password = "Password is required.";
  } else if (input.password.length < 6) {
    errors.password = "Password must be at least 6 characters.";
  }

  return errors;
}

export function validatePasswordResetFields(input: PasswordResetInput): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const email = input.email.trim();

  if (!email) {
    errors.email = "Email address is required.";
  } else if (!emailPattern.test(email)) {
    errors.email = "Enter a valid email address.";
  }

  return errors;
}

export function validateSignupFields(input: SignupInput): AuthFieldErrors {
  const errors = validateLoginFields(input);
  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const address = input.address.trim();
  const phoneDigits = phone.replace(/\D/g, "");

  if (fullName.length < 2) {
    errors.fullName = "Full name is required.";
  }

  if (!phone) {
    errors.phone = "Phone number is required.";
  } else if (!phonePattern.test(phone) || phoneDigits.length < 9 || phoneDigits.length > 15) {
    errors.phone = "Enter a valid phone number, for example 0769715227 or +94769715227.";
  }

  if (address.length < 5) {
    errors.address = "Address is required.";
  }

  return errors;
}

export function hasAuthErrors(errors: AuthFieldErrors) {
  return Object.values(errors).some(Boolean);
}

export function authErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String((error as { code?: unknown }).code);
    if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-login-credentials"].includes(code)) {
      return "Invalid email or password. Please check your credentials and try again.";
    }
    if (code === "auth/email-already-in-use") {
      return "An account already exists for this email. Sign in instead.";
    }
    if (code === "auth/weak-password") {
      return "Choose a stronger password with at least 6 characters.";
    }
    if (code === "auth/invalid-email") {
      return "Enter a valid email address.";
    }
    if (code === "auth/too-many-requests") {
      return "Too many attempts. Please wait a moment and try again.";
    }
    if (code === "auth/network-request-failed") {
      return "Network error. Check your connection and try again.";
    }
    if (code === "auth/local-password-reset-unavailable") {
      return "Password reset emails are temporarily unavailable. Please try again later.";
    }
  }

  return error instanceof Error ? sanitizePublicMessage(error.message, fallback) : fallback;
}
