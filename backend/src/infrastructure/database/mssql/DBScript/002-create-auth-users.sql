CREATE TABLE dbo.auth_users
(
    user_id UNIQUEIDENTIFIER NOT NULL,

    username VARCHAR(100)
        COLLATE Latin1_General_100_BIN2 NOT NULL,

    display_name NVARCHAR(200) NOT NULL,
    password_hash VARCHAR(200) NOT NULL,

    is_active BIT NOT NULL
        CONSTRAINT DF_auth_users_is_active DEFAULT (1),

    CONSTRAINT PK_auth_users
        PRIMARY KEY (user_id),

    CONSTRAINT UQ_auth_users_username
        UNIQUE (username)
);