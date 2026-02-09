import { Type } from "@sinclair/typebox";
import { NonEmptyString } from "./primitives.js";

export const BillingStatusParamsSchema = Type.Object({}, { additionalProperties: false });

export const BillingPackagesParamsSchema = Type.Object({}, { additionalProperties: false });

export const BillingPurchaseParamsSchema = Type.Object(
  {
    packageId: Type.Optional(NonEmptyString),
    tokens: Type.Optional(Type.Integer({ minimum: 1 })),
    orderId: Type.Optional(NonEmptyString),
    priceCny: Type.Optional(Type.Number({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const BillingOrderCreateParamsSchema = Type.Object(
  {
    packageId: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BillingOrderStatusParamsSchema = Type.Object(
  {
    orderNo: NonEmptyString,
  },
  { additionalProperties: false },
);

export const BillingOrdersListParamsSchema = Type.Object(
  {
    limit: Type.Optional(Type.Integer({ minimum: 1 })),
  },
  { additionalProperties: false },
);
