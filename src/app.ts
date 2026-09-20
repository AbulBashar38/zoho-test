import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { BillingRoutes } from "./app/module/billing/billing.route";
import { OrderRoutes } from "./app/module/order/order.route";
import { ZohoRoutes } from "./app/module/zoho/zoho.route";

const app: Application = express();

app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);

app.use("/api/zoho", ZohoRoutes);
app.use("/api/billing", BillingRoutes);
app.use("/api/orders", OrderRoutes);
// Kept so existing /api/payments callers keep working.
app.use("/api/payments", OrderRoutes);

// Basic route
app.get("/", async (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to PH Healthcare System Backend",
  });
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
