namespace SmartSub.Api.Dtos;

public record RegisterRequest(string Email, string Password, string DisplayName);

public record LoginRequest(string Email, string Password);

public record AuthResponse(string Token, string Email, string DisplayName);

public record ProfileResponse(
    string Email,
    string DisplayName,
    DateTime CreatedAt,
    int DefaultNotifyDaysBefore
);

public record UpdateProfileRequest(string DisplayName, int DefaultNotifyDaysBefore);

public record ChangePasswordRequest(string CurrentPassword, string NewPassword);
