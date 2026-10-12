CREATE TABLE dbo.auth_sessions
(
    session_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(200) NOT NULL,
    refresh_token_hash VARBINARY(32) NOT NULL,
    expires_at DATETIME2(3) NOT NULL,
    revoked_at DATETIME2(3) NULL,

    CONSTRAINT PK_auth_sessions
        PRIMARY KEY (session_id),

    CONSTRAINT CK_auth_sessions_hash_length
        CHECK (DATALENGTH(refresh_token_hash) = 32)
);

CREATE INDEX IX_auth_sessions_expires_at
    ON dbo.auth_sessions (expires_at);