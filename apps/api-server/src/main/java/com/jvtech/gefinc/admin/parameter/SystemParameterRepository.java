package com.jvtech.gefinc.admin.parameter;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SystemParameterRepository extends JpaRepository<SystemParameter, String> {

  Optional<SystemParameter> findByKey(String key);
}
