export class ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  meta?: Record<string, any>;

  static ok<T>(data: T, message?: string, meta?: Record<string, any>): ApiResponse<T> {
    return { success: true, data, message, meta };
  }

  static fail(message: string): ApiResponse<null> {
    return { success: false, data: null, message };
  }
}
