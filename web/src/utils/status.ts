export function statusColor(status: string) {
  switch (status) {
    case "Accepted":
      return "green";
    case "Wrong Answer":
      return "red";
    case "Compile Error":
    case "Runtime Error":
    case "System Error":
      return "volcano";
    case "Time Limit Exceeded":
    case "Memory Limit Exceeded":
      return "orange";
    case "Judging":
    case "Pending":
      return "blue";
    default:
      return "default";
  }
}
