package mail

import (
	"errors"

	emailverifier "github.com/AfterShip/email-verifier"
)

var (
	verifier = emailverifier.NewVerifier()
)

func VerifyEmail(email string) error {

	ret, err := verifier.Verify(email)
	if err != nil {
		return errors.New("验证邮箱失败" + err.Error())
	}

	if !ret.Syntax.Valid {
		return errors.New("邮箱格式不正确")
	}

	// if ret.Reachable == "unknown" {
	// 	return errors.New("邮箱无法验证")
	// }

	// if ret.RoleAccount || ret.Disposable || ret.Free {
	// 	return errors.New("邮箱是临时邮箱")
	// }
	return nil

}
