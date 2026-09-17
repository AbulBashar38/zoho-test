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
import { catchAsync } from "./app/utils/catchAsync";
import { sendResponse } from "./app/utils/sendResponse";
import {
  runZohoOrganizationsTest,
  runZohoTest,
} from "./integrations/zoho/zoho-test.service";

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

// Zoho Books integration test endpoints. They create real accounting records in Zoho,
// so they are never exposed in production.
if (config.node_env !== "production") {
  app.get(
    "/api/zoho/test",
    catchAsync(async (_req: Request, res: Response) => {
      console.log("hi");

      const result = await runZohoOrganizationsTest();
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zoho Books connection is working",
        data: result,
      });
    }),
  );

  app.post(
    "/api/zoho/test",
    catchAsync(async (req: Request, res: Response) => {
      const result = await runZohoTest(req.body);
      sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zoho Books integration test completed",
        data: result,
      });
    }),
  );
}

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
