package com.jvtech.gefinc.admin.email;

import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface EmailDeliveryRepository extends JpaRepository<EmailDelivery, Long> {

  /** Apaga, em transação própria, um lote de envios anteriores ao limite. */
  @Transactional
  @Modifying
  @Query(
      value =
          """
          DELETE FROM email_deliveries
          WHERE id IN (
              SELECT id FROM email_deliveries
              WHERE created_at < :limit
              ORDER BY created_at
              LIMIT :batch
          )
          """,
      nativeQuery = true)
  int deleteBatchBefore(@Param("limit") Instant limit, @Param("batch") int batch);
}
