import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";
import { AuthProvider } from "./state/AuthContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#2563eb",
          colorSuccess: "#059669",
          colorWarning: "#d97706",
          colorError: "#dc2626",
          colorInfo: "#2563eb",
          colorText: "#172033",
          colorTextSecondary: "#667085",
          colorBorder: "#d8dee8",
          colorBgLayout: "#f5f7fb",
          borderRadius: 8,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
        },
        components: {
          Button: {
            borderRadius: 7,
            controlHeight: 36,
            fontWeight: 500
          },
          Input: {
            borderRadius: 7,
            controlHeight: 36
          },
          Select: {
            borderRadius: 7,
            controlHeight: 36
          },
          Table: {
            borderColor: "#e7ebf2",
            cellPaddingBlock: 13,
            cellPaddingInline: 16,
            headerBg: "#f8fafc",
            headerColor: "#475467",
            rowHoverBg: "#f8fbff"
          },
          Tag: {
            borderRadiusSM: 999
          }
        }
      }}
    >
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);
