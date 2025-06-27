import { Node, Integer } from "neo4j-driver";
import { BaseModel } from "./base.model";

export interface IUser extends BaseModel {
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

  isVerified?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;

  isFollowingBack?: boolean;
  isFollowing?: boolean;

  lastLogin?: Date | string;
}

export type User = Node<Integer, IUser>;

export type CreateUserDto = Pick<IUser, "email" | "password">;

export type UserResponseDto = Omit<
  IUser,
  "password" | "resetPasswordToken" | "resetPasswordTokenExpiryTime" | "isDeleted" 
>;
