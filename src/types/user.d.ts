import { Node, Relationship, Integer } from "neo4j-driver";

interface IUser {
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
  resetPasswordExpire?: Number;
  lastLogin?: Date | string;
  createdAt?: Date | string;
  updateAt?: Date | string;
}

export type User = Node<Integer, IUser>;
