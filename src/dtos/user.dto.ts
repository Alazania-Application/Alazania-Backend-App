import { Node, Relationship, Integer } from "neo4j-driver";

export interface IUser {
  id: string;
  email: string;
  password?: string;
  googleIdToken?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  username?: string;

  isDeleted?: boolean;
  isVerified?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;

  resetPasswordToken?: string;
  resetPasswordTokenExpiryTime?: Number;
  lastLogin?: Date | string;
  createdAt?: Date | string;
  updateAt?: Date | string;
}

export type User = Node<Integer, IUser>;

export type CreateUserDto = Pick<IUser, "email" | "password">;

export type UserResponseDto = Omit<
  IUser,
  "password" | "resetPasswordToken" | "resetPasswordTokenExpiryTime" | "isDeleted" 
>;
