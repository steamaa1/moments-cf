package mail

import (
	"crypto/tls"
	"fmt"

	"github.com/emersion/go-sasl"
	"github.com/emersion/go-smtp"
)

func GetSMTPClient(host, port, username, password string) (*smtp.Client, error) {
	// TLS配置
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
	}

	// 连接到SMTP服务器
	client, err := smtp.DialTLS(host+":"+port, tlsConfig)
	if err != nil {
		return nil, fmt.Errorf("无法连接到SMTP服务器: %v", err)
	}

	// 测试HELO/EHLO命令
	if err := client.Hello("localhost"); err != nil {
		return nil, fmt.Errorf("SMTP服务器不可用: %v", err)
	}

	// 测试认证
	auth := sasl.NewPlainClient("", username, password)
	if err := client.Auth(auth); err != nil {
		return nil, fmt.Errorf("SMTP认证失败: %v", err)
	}

	return client, nil
}
