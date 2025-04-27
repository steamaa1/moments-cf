package util

import (
	"net/url"
)

func ValidHttpUrl(str string) (bool, error) {
	if str == "" {
		return false, nil
	}

	parsedUrl, err := url.Parse(str)
	if err != nil {
		return false, err
	}

	if parsedUrl.Scheme != "https" && parsedUrl.Scheme != "http" {
		return false, nil
	}

	return true, nil
}
