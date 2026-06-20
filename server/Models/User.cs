namespace SmartSub.Api.Models;

public class User
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Значение по умолчанию для "напомнить за N дней до списания" —
    /// подставляется при создании новой подписки, настраивается в профиле.
    /// </summary>
    public int DefaultNotifyDaysBefore { get; set; } = 3;

    public List<Subscription> Subscriptions { get; set; } = new();
}
